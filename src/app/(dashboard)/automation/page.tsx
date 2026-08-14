import SaaSAutomationPanel from '@/components/saas-automation/saas-accounts-panel';

export const metadata = {
  title: 'Automatisation SaaS — Gen3ia',
  description: 'Gérez vos comptes SaaS externes et permettez aux agents IA d\'agir en votre nom de manière autonome.',
};

export default function AutomationPage() {
  return <SaaSAutomationPanel />;
}
