const deprecatedApiResponseCacheNames = ["cashier-api-cache"];

type CacheStorageLike = {
  delete: (cacheName: string) => Promise<boolean>;
};

const getBrowserCacheStorage = (): CacheStorageLike | undefined => {
  if (typeof window === "undefined" || !("caches" in window)) {
    return undefined;
  }

  return window.caches;
};

export const clearDeprecatedApiResponseCaches = async (
  cacheStorage: CacheStorageLike | undefined = getBrowserCacheStorage(),
): Promise<void> => {
  if (!cacheStorage) {
    return;
  }

  await Promise.all(
    deprecatedApiResponseCacheNames.map((cacheName) =>
      cacheStorage.delete(cacheName).catch(() => false),
    ),
  );
};
