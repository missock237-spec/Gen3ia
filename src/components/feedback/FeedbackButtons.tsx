"use client";
import React, { useState } from "react";
import { Star } from "lucide-react";

export default function FeedbackButtons({ agentId, executionId, userId, onFeedbackSent }) {
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(0);

  const submit = async (r) => {
    setRating(r);
    try {
      await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, executionId, userId, rating: r }),
      });
      setSubmitted(true);
      if (onFeedbackSent) onFeedbackSent(r);
    } catch { /* ignore */ }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-400">
        <Star className="w-3 h-3" />
        <span>Merci ({rating}/5)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Evaluez:</span>
      {[1, 2, 3, 4, 5].map((r) => (
        <button key={r} onClick={() => submit(r)}
          className="p-1 rounded hover:bg-gray-700 hover:text-yellow-400 transition text-gray-500">
          <Star className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
