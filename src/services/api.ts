import axios from "axios";
import { PluginSearchResult, ExtractionResult } from "../types";

export const searchPlugins = async (query: string): Promise<PluginSearchResult[]> => {
  const response = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
  return response.data;
};

export const getPluginContext = async (pluginId: number, pluginName: string, deep: boolean) => {
  const response = await axios.post("/api/context", { pluginId, pluginName, deep });
  return response.data;
};
