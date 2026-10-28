import { META_GRAPH_BASE_URL } from "./api";
import { createMetaGraphError, fetchMetaGraph } from "./graph";

type GraphRecord = Record<string, unknown>;

async function readGraphNode(path: string, accessToken: string, fields?: string): Promise<GraphRecord> {
  const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  const url = new URL(`${META_GRAPH_BASE_URL}/${encodedPath}`);
  url.searchParams.set("access_token", accessToken);
  if (fields) url.searchParams.set("fields", fields);

  const response = await fetchMetaGraph(url, { cache: "no-store" });
  const json = await response.json().catch(() => null) as GraphRecord | null;
  if (!response.ok) throw createMetaGraphError(json?.error, response.status, "Lecture Meta impossible");
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("Meta n’a pas renvoyé un état lisible");
  return json;
}

export async function getMetaGrantedPermissions(accessToken: string): Promise<Set<string>> {
  const json = await readGraphNode("me/permissions", accessToken);
  if (!Array.isArray(json.data)) throw new Error("Meta n’a pas renvoyé la liste des permissions");
  return new Set(json.data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as GraphRecord;
    return row.status === "granted" && typeof row.permission === "string" ? [row.permission] : [];
  }));
}

export type MetaPausedObjectState = {
  id: string;
  status: string;
  effectiveStatus: string;
};

function requirePausedObjectState(json: GraphRecord, expectedId: string): MetaPausedObjectState {
  const id = typeof json.id === "string" ? json.id : String(json.id ?? "");
  if (id !== expectedId) throw new Error("Meta n’a pas confirmé l’identifiant de l’objet");
  if (typeof json.status !== "string" || typeof json.effective_status !== "string") {
    throw new Error("Meta n’a pas confirmé les états status et effective_status");
  }
  return { id, status: json.status, effectiveStatus: json.effective_status };
}

export async function readMetaPausedTestCampaign(campaignId: string, accessToken: string) {
  const json = await readGraphNode(campaignId, accessToken, "id,objective,status,effective_status");
  const state = requirePausedObjectState(json, campaignId);
  return { ...state, objective: typeof json.objective === "string" ? json.objective : "" };
}

export async function readMetaPausedTestAdSet(adSetId: string, accessToken: string) {
  const json = await readGraphNode(adSetId, accessToken, "id,status,effective_status,optimization_goal,destination_type,promoted_object,targeting");
  const state = requirePausedObjectState(json, adSetId);
  const promoted = json.promoted_object && typeof json.promoted_object === "object" ? json.promoted_object as GraphRecord : {};
  const targeting = json.targeting && typeof json.targeting === "object" ? json.targeting as GraphRecord : {};
  const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    ...state,
    optimizationGoal: typeof json.optimization_goal === "string" ? json.optimization_goal : "",
    destinationType: typeof json.destination_type === "string" ? json.destination_type : "",
    customEventType: typeof promoted.custom_event_type === "string" ? promoted.custom_event_type : "",
    publisherPlatforms: stringArray(targeting.publisher_platforms),
    whatsappPositions: stringArray(targeting.whatsapp_positions),
    instagramPositions: stringArray(targeting.instagram_positions),
    userAgeUnknown: typeof targeting.user_age_unknown === "boolean" ? targeting.user_age_unknown : null,
  };
}

export async function readMetaPausedTestObjectStatus(objectId: string, accessToken: string): Promise<MetaPausedObjectState> {
  const json = await readGraphNode(objectId, accessToken, "id,status,effective_status");
  return requirePausedObjectState(json, objectId);
}
