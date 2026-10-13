import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";

const TopicSchema = z.object({ id:z.string(), title:z.string(), part:z.number().int().min(1).max(3), category:z.string(), prompts:z.array(z.string()).min(1), sourceTitle:z.string(), sourceSha256:z.string().regex(/^[a-f0-9]{64}$/u), sourcePage:z.number().int().positive().nullable(), referenceId:z.string(), sourceVersion:z.string() }).strict();
const SessionSchema = z.object({ id:z.string(), topicId:z.string(), status:z.enum(["in-progress","completed"]), elapsedSeconds:z.number().int().nonnegative(), notes:z.string(), createdAt:z.string(), updatedAt:z.string(), completedAt:z.string().nullable() }).strict();
const RecordingSchema = z.object({ id:z.string(), sessionId:z.string(), sha256:z.string(), byteLength:z.number(), mimeType:z.literal("audio/webm"), createdAt:z.string() }).strict();
export type SpeakingTopic=z.infer<typeof TopicSchema>;
export type SpeakingSession=z.infer<typeof SessionSchema>;
export type SpeakingRecording=z.infer<typeof RecordingSchema>;
export interface SpeakingRepository {
  topics():Promise<SpeakingTopic[]>; sessions():Promise<SpeakingSession[]>; favorites():Promise<string[]>;
  start(topicId:string):Promise<SpeakingSession>; save(sessionId:string,elapsed:number,notes:string,complete?:boolean):Promise<SpeakingSession>;
  favorite(topicId:string,favorite:boolean):Promise<void>;
  recordings(sessionId:string):Promise<SpeakingRecording[]>; record(sessionId:string,blob:Blob):Promise<SpeakingRecording>; audio(recordingId:string):Promise<Blob>;
}
export function createMemorySpeakingRepository(topics:SpeakingTopic[]=[]):SpeakingRepository {
  const sessions=new Map<string,SpeakingSession>(); const favorites=new Set<string>();
  return {async topics(){return topics;},async sessions(){return [...sessions.values()];},async favorites(){return [...favorites];},async favorite(id,on){if(on)favorites.add(id);else favorites.delete(id);},async start(topicId){const current=[...sessions.values()].find(s=>s.topicId===topicId&&s.status==="in-progress");if(current)return {...current};const now=new Date().toISOString();const session:SpeakingSession={id:crypto.randomUUID(),topicId,status:"in-progress",elapsedSeconds:0,notes:"",createdAt:now,updatedAt:now,completedAt:null};sessions.set(session.id,session);return {...session};},async save(id,elapsed,notes,complete=false){const s=sessions.get(id);if(!s||s.status==="completed")throw new Error("Attempt unavailable");const next:SpeakingSession={...s,elapsedSeconds:Math.max(s.elapsedSeconds,elapsed),notes,status:complete?"completed":"in-progress",updatedAt:new Date().toISOString(),completedAt:complete?new Date().toISOString():null};sessions.set(id,next);return {...next};},async recordings(){return [];},async record(){throw new Error("Recording requires the desktop app");},async audio(){throw new Error("Recording requires the desktop app");}};
}
const native:SpeakingRepository={
  async topics(){return z.array(TopicSchema).parse(await invoke("speaking_topics"));},async sessions(){return z.array(SessionSchema).parse(await invoke("speaking_sessions"));},async favorites(){return z.array(z.string()).parse(await invoke("speaking_favorites"));},
  async start(topicId){return SessionSchema.parse(await invoke("speaking_start",{topicId}));},async save(sessionId,elapsed,notes,complete=false){return SessionSchema.parse(await invoke("speaking_save",{sessionId,elapsed,notes,complete}));},async favorite(topicId,favorite){await invoke("speaking_favorite",{topicId,favorite});},
  async recordings(sessionId){return z.array(RecordingSchema).parse(await invoke("speaking_recordings",{sessionId}));},
  async record(sessionId,blob){if(blob.size>32*1024*1024)throw new Error("Recording exceeds 32 MB. Keep recordings short.");const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return RecordingSchema.parse(await invoke("speaking_record",{sessionId,encoded:btoa(binary)}));},
  async audio(recordingId){const encoded=z.string().parse(await invoke("speaking_audio",{recordingId}));return new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:"audio/webm"});},
};
export const speakingRepository:SpeakingRepository=isTauri()?native:createMemorySpeakingRepository();
