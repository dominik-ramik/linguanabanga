import { getCurrentInstance } from 'vue';

export function useGlobalMessageChannel() {
  const vm = getCurrentInstance();

  return vm?.appContext.config.globalProperties.$messageChannel;
}