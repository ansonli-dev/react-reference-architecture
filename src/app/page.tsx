const boundaries = [
  ['浏览器', '组件交互、表单和客户端草稿'],
  ['Next.js 服务端', '页面渲染、路由组合和数据获取'],
  ['BFF', '会话、接口聚合和后端适配'],
  ['业务后端', '业务规则、事务和权威数据'],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <p className="text-sm font-semibold tracking-widest text-blue-700">
        REACT REFERENCE ARCHITECTURE
      </p>
      <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
        现代 React 应用参考架构
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        以在线书店贯穿服务端渲染、客户端交互与
        BFF，展示模块边界、数据流和工程实践。
      </p>
      <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        工程初始化阶段：业务功能、认证与真实后端集成尚未实现。
      </p>
      <section aria-labelledby="boundaries" className="mt-14">
        <h2 id="boundaries" className="text-2xl font-semibold">
          架构职责
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {boundaries.map(([title, description]) => (
            <article
              key={title}
              className="rounded-xl border border-slate-200 bg-white p-6"
            >
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <footer className="mt-12 text-sm text-slate-500">
        建设基线：docs/project-guide.md · 架构决策：docs/adr/
      </footer>
    </main>
  );
}
