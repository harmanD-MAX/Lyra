import React from 'react';

export default function LyraLogo({ className = "" }) {
  return (
    <div className={`flex items-center gap-[3px] h-6 py-1 flex-shrink-0 ${className}`}>
      <span className="w-[3px] h-3 bg-white/90 rounded-full group-hover:bg-[#e5a958] transition-all duration-300"></span>
      <span className="w-[3px] h-5 bg-white rounded-full group-hover:bg-[#e5a958] transition-all duration-300"></span>
      <span className="w-[3px] h-2 bg-white/70 rounded-full group-hover:bg-[#e5a958] transition-all duration-300"></span>
      <span className="w-[3px] h-6 bg-white rounded-full group-hover:bg-[#e5a958] transition-all duration-300"></span>
      <span className="w-[3px] h-3 bg-white/80 rounded-full group-hover:bg-[#e5a958] transition-all duration-300"></span>
    </div>
  );
}
