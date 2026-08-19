// Email Templates — templates HTML pour les emails d'authentification
// Logo Gen3ia intégré via image hébergée sur l'app URL.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.online';
const LOGO_IMG = `<img src="${APP_URL}/logo.png" alt="Gen3ia" style="width:64px;height:64px;border-radius:12px;display:block;margin:0 auto 24px" />`;

export function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Bienvenue sur Gen3ia !',
    html: '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:32px}.container{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08)}h1{font-size:22px;color:#1a1a2e;margin:0 0 12px}p{font-size:15px;color:#555;line-height:1.6;margin:0 0 16px}.btn{display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px}.footer{font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:16px}</style></head><body><div class="container">' + LOGO_IMG + '<h1>Bienvenue, ' + name + ' !</h1><p>Votre compte a été créé avec succès. Vous pouvez maintenant créer des agents IA, connecter vos services et automatiser vos tâches.</p><a href="' + APP_URL + '/login" class="btn">Se connecter</a><div class="footer"><p>Gen3ia — AI Operating System</p></div></div></body></html>',
  };
}

export function verifyEmailLinkTemplate(linkOrCode: string, name: string): { subject: string; html: string } {
  const isLink = linkOrCode.startsWith('http');
  const actionBlock = isLink
    ? `<a href="${linkOrCode}" class="btn">Vérifier mon email</a><p style="font-size:13px;color:#888;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p><p style="font-size:12px;color:#7c3aed;word-break:break-all;">${linkOrCode}</p>`
    : `<div class="code">${linkOrCode}</div>`;

  return {
    subject: 'Vérifiez votre adresse email',
    html: '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:32px}.container{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08)}h1{font-size:22px;color:#1a1a2e;margin:0 0 12px}p{font-size:15px;color:#555;line-height:1.6;margin:0 0 16px}.code{font-size:36px;font-weight:700;color:#7c3aed;text-align:center;padding:20px;background:#f8f7ff;border-radius:8px;margin:16px 0;letter-spacing:8px}.btn{display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px}.footer{font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:16px}</style></head><body><div class="container">' + LOGO_IMG + '<h1>Vérification email</h1><p>Bonjour ' + name + ', ' + (isLink ? 'cliquez sur le bouton ci-dessous pour vérifier votre adresse email.' : 'utilisez le code ci-dessous pour vérifier votre adresse email.') + '</p>' + actionBlock + '<p>Ce ' + (isLink ? 'lien' : 'code') + ' expire dans 10 minutes.</p><div class="footer"><p>Gen3ia — AI Operating System</p></div></div></body></html>',
  };
}

export function verifyEmailEmail(code: string, name: string): { subject: string; html: string } {
  return verifyEmailLinkTemplate(code, name);
}

export function resetPasswordEmail(resetLink: string, name: string): { subject: string; html: string } {
  return {
    subject: 'Réinitialisation de mot de passe',
    html: '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:32px}.container{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08)}h1{font-size:22px;color:#1a1a2e;margin:0 0 12px}p{font-size:15px;color:#555;line-height:1.6;margin:0 0 16px}.btn{display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px}.warning{background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;font-size:13px;color:#795548;margin:16px 0}.footer{font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:16px}</style></head><body><div class="container">' + LOGO_IMG + '<h1>Réinitialisation du mot de passe</h1><p>Bonjour ' + name + ', vous avez demandé la réinitialisation de votre mot de passe.</p><a href="' + resetLink + '" class="btn">Réinitialiser mon mot de passe</a><div class="warning">Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.</div><div class="footer"><p>Gen3ia — AI Operating System</p></div></div></body></html>',
  };
}

export function loginAlertEmail(name: string, ip: string, device: string, location: string): { subject: string; html: string } {
  return {
    subject: 'Nouvelle connexion sur votre compte',
    html: '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:32px}.container{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08)}h1{font-size:22px;color:#1a1a2e;margin:0 0 12px}p{font-size:15px;color:#555;line-height:1.6;margin:0 0 12px}.details{background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0}.details-item{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;border-bottom:1px solid #eee}.details-item:last-child{border-bottom:none}.label{color:#888}.value{color:#333;font-weight:500}.footer{font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:16px}</style></head><body><div class="container">' + LOGO_IMG + '<h1>Nouvelle connexion détectée</h1><p>Bonjour ' + name + ', une nouvelle connexion a été effectuée sur votre compte Gen3ia.</p><div class="details"><div class="details-item"><span class="label">Adresse IP</span><span class="value">' + ip + '</span></div><div class="details-item"><span class="label">Appareil</span><span class="value">' + device + '</span></div><div class="details-item"><span class="label">Localisation</span><span class="value">' + location + '</span></div></div><div class="footer"><p>Si ce n\'est pas vous, changez votre mot de passe immédiatement.</p></div></div></body></html>',
  };
}
