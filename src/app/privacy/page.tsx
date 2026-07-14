import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politique de confidentialité | Genova AI',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Politique de confidentialité</h1>
      <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : 14 juillet 2026</p>
      
      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="text-xl font-semibold">1. Collecte des données</h2>
        <p>Nous collectons les informations suivantes :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Adresse email et nom (lors de l&apos;inscription)</li>
          <li>Données d&apos;utilisation (agents créés, crédits utilisés)</li>
          <li>Cookies techniques pour la session</li>
        </ul>

        <h2 className="text-xl font-semibold pt-4">2. Utilisation des données</h2>
        <p>Vos données sont utilisées pour :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Fournir et améliorer le service Genova AI</li>
          <li>Gérer votre compte et vos abonnements</li>
          <li>Vous envoyer des notifications importantes</li>
        </ul>

        <h2 className="text-xl font-semibold pt-4">3. Publicités</h2>
        <p>Nous utilisons Google AdSense pour afficher des publicités. Google peut utiliser des cookies pour personnaliser les annonces. Vous pouvez en savoir plus sur la politique de confidentialité de Google.</p>

        <h2 className="text-xl font-semibold pt-4">4. Sécurité</h2>
        <p>Nous mettons en œuvre des mesures de sécurité techniques pour protéger vos données : cryptage SHA-256 des mots de passe, HTTPS, sessions sécurisées.</p>

        <h2 className="text-xl font-semibold pt-4">5. Contact</h2>
        <p>Pour toute question : <a href="mailto:missock237@gmail.com" className="text-primary hover:underline">missock237@gmail.com</a></p>
      </section>
    </div>
  );
}
