"use client";
import dynamic from "next/dynamic";
const AgentStudio = dynamic(() => import("@/components/studio/AgentStudio"), { ssr: false, loading: () => <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Chargement...</div> });
export default function StudioPage() { return <AgentStudio />; }
