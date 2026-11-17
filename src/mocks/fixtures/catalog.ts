import type { Book } from '../../features/catalog/model';

const rows = [
  ['React 应用架构', '林岚', 'Architecture', 4900, 'CNY', 5],
  ['面向领域的前端', '陈越', 'Architecture', 5600, 'CNY', 6],
  ['边界与依赖', '贺言', 'Architecture', 4200, 'CNY', 9],
  [
    'Designing Service Boundaries',
    'Mia Torres',
    'Architecture',
    2600,
    'USD',
    4,
  ],
  ['从请求到页面', '叶宁', 'Architecture', 5800, 'CNY', 3],
  ['可靠交付实践', '周航', 'Architecture', 6600, 'CNY', 7],
  ['Web 系统设计', '顾北', 'Architecture', 7200, 'CNY', 8],
  ['TypeScript 类型建模', '许知', 'Programming', 6900, 'CNY', 4],
  ['React 组件协作', '宋雨', 'Programming', 4900, 'CNY', 5],
  [
    'Web Accessibility in Practice',
    'Jules Martin',
    'Programming',
    3200,
    'USD',
    3,
  ],
  ['浏览器与网络', '谢冬', 'Programming', 5800, 'CNY', 0],
  ['可测试的接口设计', '章平', 'Programming', 5200, 'CNY', 5],
  ['前端性能调试', '唐玉', 'Programming', 4700, 'CNY', 2],
  ['Modern CSS Layout', 'Alex Ruiz', 'Programming', 1800, 'USD', 12],
] as const;

export const demoBooks: readonly Book[] = rows.map(
  ([title, author, category, priceMinor, currency, stock], index) => ({
    id: '00000000-0000-4000-8000-' + String(101 + index).padStart(12, '0'),
    title,
    author,
    category,
    priceMinor,
    currency,
    stock,
  }),
);

const descriptions = [
  [
    '以一间在线书店为例，拆解 React 应用的路由、渲染和数据读取。讨论哪些状态放进 URL，哪些留在组件，以及模块怎样在业务增长后继续协作。',
    'Follow an online bookstore through routing, rendering, and data fetching. Learn where state belongs and how to keep React modules working together as the product grows.',
  ],
  [
    '从订单和库存这样的业务概念出发，把模型、界面和远程接口组织成能独立演进的前端模块。',
    'Start with orders and stock, then organize their models, interfaces, and UI into frontend modules that can change independently.',
  ],
  [
    '通过目录、结算和第三方服务的例子，识别合适的模块边界，控制跨层依赖，并为变化频繁的部分留出替换空间。',
    'Use catalog, checkout, and third-party service examples to choose module boundaries and make changing dependencies easier to replace.',
  ],
  [
    '从报价和库存预留的例子出发，讨论如何划分服务职责，并选择有利于故障恢复的契约。',
    'Use quotes and stock reservations to decide which responsibilities each service owns and design contracts that support recovery.',
  ],
  [
    '跟踪一次浏览请求经过路由、服务端渲染和浏览器交互的全过程，配合实际案例理解缓存、流式渲染和错误反馈。',
    'Trace a browser request through routing, server rendering, and client interaction with practical examples of caching, streaming, and failures.',
  ],
  [
    '从构建产物、验证环境到发布和回滚，梳理一次版本交付中可重复执行的关键步骤。',
    'Walk through reproducible builds, verification environments, releases, and rollbacks for a web application.',
  ],
  [
    '用读多写少的目录和事务订单说明缓存、数据库与应用服务之间的取舍。',
    'Compare caching, databases, and application services using a read-heavy catalog and transactional orders.',
  ],
  [
    '用可辨识联合、值对象和运行时校验表达业务规则，减少跨层传输时丢失的信息。',
    'Represent business rules with discriminated unions, value objects, and runtime validation to keep meaning across layers.',
  ],
  [
    '围绕表单、筛选器和页面组合，讨论组件间的状态归属、回调约定与可访问交互。',
    'Work through forms, filters, and page composition to understand component state, callbacks, and accessible interactions.',
  ],
  [
    '用目录、表单和对话框练习键盘操作、焦点管理、对比度与状态反馈。',
    'Practice keyboard navigation, focus management, contrast, and feedback on catalogs, forms, and dialogs.',
  ],
  [
    '从输入网址到资源加载，理解 DNS、HTTP、缓存以及浏览器怎样调度请求。',
    'Follow a request from the address bar through DNS, HTTP, caching, and the browser request scheduler.',
  ],
  [
    '围绕订单创建和外部服务集成，设计便于测试的接口与错误反馈。',
    'Design testable interfaces and clear error feedback around order creation and external services.',
  ],
  [
    '用性能分析工具定位渲染、脚本和网络瓶颈，并通过复测验证优化结果。',
    'Use performance tools to isolate rendering, script, and network bottlenecks, then measure the effect of your changes.',
  ],
  [
    '用书籍网格、详情布局和移动端列表练习 Grid、Flexbox 与响应式布局。',
    'Practice Grid, Flexbox, and responsive layout with bookshelves, product details, and mobile lists.',
  ],
] as const;

export function demoBookDescription(id: Book['id'], locale: 'zh-CN' | 'en') {
  const index = demoBooks.findIndex((book) => book.id === id);
  return descriptions[index]?.[locale === 'zh-CN' ? 0 : 1];
}
