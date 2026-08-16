'use client';

import dynamic from 'next/dynamic';

const CodePlayground = dynamic(
  () => import('@/components/studio/code-playground'),
  { ssr: false }
);

export default function CodeStudioPage() {
  return (
    <div className='container mx-auto py-8 px-4 max-w-7xl'>
      <CodePlayground />
    </div>
  );
}
