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
