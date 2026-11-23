
import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

root = Path(__file__).resolve().parents[1]
schemas = {
    path.name.removesuffix(".schema.json"): json.loads(path.read_text())
    for path in sorted((root / "contracts").glob("*.schema.json"))
}
registry = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in schemas.values()
)
for schema in schemas.values():
    Draft202012Validator.check_schema(schema)


def validate(schema, value):
    return Draft202012Validator(schemas[schema], registry=registry).is_valid(value)


def fixture(name):
    return json.loads((root / "fixtures" / name).read_text())


for name in schemas:
    value = (fixture("valid/activation-blocked.json")["binding"]
             if name == "activation-binding" else fixture(f"valid/{name}.json"))
    assert validate(name, value), name

assert not validate("candidate", fixture("invalid/candidate.json"))
assert not validate("callback", fixture("invalid/callback.json"))
assert not validate("qa-signoff", {**fixture("valid/qa-signoff.json"), "qa_passed": True})

k8s = {path.stem: list(yaml.safe_load_all(path.read_text())) for path in (root / "k8s").glob("*.yaml")}
bootstrap = k8s.pop("bootstrap")
resources = {(obj["kind"], obj["metadata"].get("namespace"), obj["metadata"]["name"]): obj
             for obj in bootstrap}
assert len(resources) == len(bootstrap)
assert set(k8s) == {"develop", "test", "prod"}

for env, docs in k8s.items():
    ns = f"rra-{env}"
    deployer = f"{ns}-deployer"
    assert ("Namespace", None, ns) in resources
    assert all(obj["metadata"]["namespace"] == ns for obj in docs)
    assert {obj["kind"] for obj in docs} == {"Deployment", "Service", "ConfigMap"}
    deployment, service, config = docs
    pods = deployment["spec"]["template"]
    app = pods["spec"]["containers"][0]
    assert deployment["spec"]["selector"]["matchLabels"] == pods["metadata"]["labels"] == service["spec"]["selector"]
    assert service["spec"]["type"] == "ClusterIP" and service["spec"]["ports"][0]["port"] == 3000
    assert app["livenessProbe"]["httpGet"]["path"] == "/api/health"
    assert app["readinessProbe"]["httpGet"]["path"] == "/api/ready"
    assert app["image"] == "registry.invalid/bookstore:unbound"
    assert config["immutable"] is True
    assert app["envFrom"] == [{"configMapRef": {"name": config["metadata"]["name"]}}]
    assert pods["spec"]["automountServiceAccountToken"] is False
    assert ("ServiceAccount", ns, pods["spec"]["serviceAccountName"]) in resources
    assert ("Role", ns, "bookstore") not in resources
    for rule in resources[("Role", ns, deployer)]["rules"]:
        assert "bookstore-delivery-state" not in rule.get("resourceNames", [])
        assert not {"secrets", "roles", "rolebindings", "pods/exec"} & set(rule["resources"])
        if {"update", "patch"} & set(rule["verbs"]):
            assert rule.get("resourceNames") in (["bookstore"], ["bookstore-deployment-record"])
    assert resources[("ClusterRole", None, f"{deployer}-namespace")]["rules"] == [{
        "apiGroups": [""], "resources": ["namespaces"], "resourceNames": [ns], "verbs": ["get"]
    }]

for obj in bootstrap:
    meta = obj["metadata"]
    if obj["kind"] in {"RoleBinding", "ClusterRoleBinding"}:
        role = obj["roleRef"]
        assert (role["kind"], meta.get("namespace"), role["name"]) in resources
        for subject in obj["subjects"]:
            assert subject["kind"] == "ServiceAccount"
            assert ("ServiceAccount", subject["namespace"], subject["name"]) in resources
    if obj["kind"] == "Role" and meta["name"] in {"rra-test-coordinator", "rra-test-lock-reader"}:
        verbs = ["get", "update"] if meta["name"].endswith("coordinator") else ["get"]
        assert meta["namespace"] == "rra-test"
        assert obj["rules"] == [{"apiGroups": [""], "resources": ["configmaps"],
                                 "resourceNames": ["bookstore-delivery-state"], "verbs": verbs}]

lock = json.loads(resources[("ConfigMap", "rra-test", "bookstore-delivery-state")]["data"]["state"])
preview_lock = fixture("valid/lock.json")
assert validate("lock", {**lock, **{k: preview_lock[k] for k in ("uid", "namespace_uid", "resource_version")}})
assert lock["phase"] == "available" and lock["holder"] is None and lock["operation"] is None

for workflow in (root / "actions").glob("*.yml.example"):
    value = yaml.safe_load(workflow.read_text())
    for job in value["jobs"].values():
        assert job["if"] == "${{ false }}"
    assert "write" not in value["permissions"].values()
    assert "pull_request_target" not in value.get(True, value.get("on", {}))

rulesets = [json.loads(file.read_text()) for file in (root / "rulesets").glob("*.json")]
assert len(rulesets) == 2
for ruleset in rulesets:
    assert ruleset["target"] == "branch" and ruleset["enforcement"] == "disabled"
    assert ruleset["bypass_actors"] == []
    assert ruleset["conditions"]["ref_name"]["include"] == ["refs/heads/test", "refs/heads/prod"]
print(f"{len(schemas)} JSON schemas, positive and negative fixtures, 3 namespace bundles, RBAC, 4 workflows and 2 rulesets verified.")
