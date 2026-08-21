import { isPagePath } from "./routing";

const SAVED_LAUNCH_PAGE_KEY = "family-board.saved-launch-page";

function getStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getSavedLaunchPage(storage?: Storage): string | null {
  let savedPath: string | null = null;

  try {
    savedPath = getStorage(storage)?.getItem(SAVED_LAUNCH_PAGE_KEY) ?? null;
  } catch {
    return null;
  }

  if (!savedPath || !isPagePath(savedPath)) {
    if (savedPath) {
      clearSavedLaunchPage(storage);
    }

    return null;
  }

  return savedPath;
}

export function saveLaunchPage(path: string, storage?: Storage) {
  if (!isPagePath(path)) {
    return;
  }

  try {
    getStorage(storage)?.setItem(SAVED_LAUNCH_PAGE_KEY, path);
  } catch {
    // Local storage may be unavailable in private browsing modes.
  }
}

export function clearSavedLaunchPage(storage?: Storage) {
  try {
    getStorage(storage)?.removeItem(SAVED_LAUNCH_PAGE_KEY);
  } catch {
    // Local storage may be unavailable in private browsing modes.
  }
}
