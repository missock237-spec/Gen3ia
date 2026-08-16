'use client';

import dynamic from 'next/dynamic';

const WorkflowAuthorizations = dynamic(
  () => import('@/components/workflows/workflow-authorizations'),
  { ssr: false }
);

export default function AuthorizationsPage() {
  return (
    <div className='container mx-auto py-8 px-4 max-w-7xl'>
      <WorkflowAuthorizations />
    </div>
  );
}
