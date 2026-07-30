import { projects } from "@/config/seed";
import { ApiVkAdsProvider } from "./api-provider";
import { MockVkAdsProvider } from "./mock-provider";
import { YandexDirectProvider } from "@/integrations/yandex-direct/provider";

export function getAdsProvider(projectId: string) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Проект не найден");
  const metrikaCounters: Record<string, string> = {};
  if (project.connectionType === "yandex") return new YandexDirectProvider(project.vkProfile, metrikaCounters[project.id]);
  return project.connectionType === "api"
    ? new ApiVkAdsProvider(project.vkProfile)
    : new MockVkAdsProvider(project.id);
}

export const getVkAdsProvider = getAdsProvider;
