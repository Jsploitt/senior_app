import { router } from 'expo-router';

/** Leave presenter mode (the presenter layout restores the previous transport on unmount). */
export function exitPresenter() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
