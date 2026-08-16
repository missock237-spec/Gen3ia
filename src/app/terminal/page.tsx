"use client";

import React from "react";
import TerminalComponent from "@/components/terminal/Terminal";

export default function TerminalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-100">Agent Terminal</h1>
          <p className="text-sm text-gray-500 mt-1">Terminal integre pour interagir avec l agent de code</p>
        </div>
        <TerminalComponent agentId="terminal-agent" userId="default" />
      </div>
    </div>
  );
}
