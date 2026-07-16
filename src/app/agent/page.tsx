import AgentChat from '@/components/agent/AgentChat';

export default function AgentPage() {
  return (
    <div className="h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="max-w-3xl mx-auto h-full py-6 px-4">
        <div className="h-full flex flex-col">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <div className="text-2xl">🌐</div>
              <div className="text-xs text-gray-500 mt-1">Actions web</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <div className="text-2xl">🔗</div>
              <div className="text-xs text-gray-500 mt-1">Plateformes</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center">
              <div className="text-2xl">🛡️</div>
              <div className="text-xs text-gray-500 mt-1">Permissions</div>
            </div>
          </div>
          <div className="flex-1">
            <AgentChat />
          </div>
        </div>
      </div>
    </div>
  );
}
