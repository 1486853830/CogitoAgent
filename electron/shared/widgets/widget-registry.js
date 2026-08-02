/* ============================================================
 *  Widget Registry — 组件注册表
 *  统一管理 6 个 widget 的生命周期:
 *    register(name, factory)  — 注册组件工厂
 *    mount(name, container, opts)  — 挂载到容器
 *    update(name, data)  — 推送数据
 *    unmount(name)  — 卸载
 *    mountAll(layout, opts)  — 按 layout 数组批量挂载
 *
 *  每个组件工厂返回: { init, update, destroy }
 * ============================================================ */

const registry = {};
const instances = {};

function register(name, factory) {
  if (typeof factory !== 'function') {
    console.warn(`[WidgetRegistry] ${name}: factory 必须是函数`);
    return false;
  }
  registry[name] = factory;
  return true;
}

function mount(name, container, opts = {}) {
  const factory = registry[name];
  if (!factory) {
    console.warn(`[WidgetRegistry] 未注册的组件: ${name}`);
    return null;
  }
  if (instances[name]) {
    console.warn(`[WidgetRegistry] ${name} 已挂载,先卸载旧实例`);
    unmount(name);
  }
  try {
    const instance = factory(container, opts);
    if (instance && typeof instance.init === 'function') {
      instance.init();
    }
    instances[name] = instance;
    return instance;
  } catch (e) {
    console.error(`[WidgetRegistry] ${name} 挂载失败:`, e);
    return null;
  }
}

function update(name, data) {
  const inst = instances[name];
  if (!inst || typeof inst.update !== 'function') return false;
  try {
    inst.update(data);
    return true;
  } catch (e) {
    console.error(`[WidgetRegistry] ${name} 更新失败:`, e);
    return false;
  }
}

function unmount(name) {
  const inst = instances[name];
  if (!inst) return;
  try {
    if (typeof inst.destroy === 'function') inst.destroy();
  } catch (e) {
    console.warn(`[WidgetRegistry] ${name} 卸载异常:`, e);
  }
  delete instances[name];
}

function unmountAll() {
  Object.keys(instances).forEach(unmount);
}

/**
 * 按 layout 批量挂载组件
 * @param {Array<{name: string, container: HTMLElement, opts?: object}>} layout
 */
function mountAll(layout) {
  if (!Array.isArray(layout)) return [];
  return layout.map(({ name, container, opts }) => mount(name, container, opts));
}

function get(name) {
  return instances[name] || null;
}

function isMounted(name) {
  return !!instances[name];
}

window.WidgetRegistry = {
  register,
  mount,
  update,
  unmount,
  unmountAll,
  mountAll,
  get,
  isMounted,
};
