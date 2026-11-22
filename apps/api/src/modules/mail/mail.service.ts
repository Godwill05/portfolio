import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';

/**
 * Transactional mail abstraction.
 *
 * When SMTP is not configured (typical local setup) messages are logged in a
 * clearly-marked form instead of being silently dropped: developers see the
 * verification / reset links scrolled in the API logs.
 *
 * Delivery is fire-and-forget so a mail outage never blocks an auth flow.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('Mail');
  private transport: { sendMail: (opts: unknown) => Promise<unknown> } | null = null;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.mail.configured) {
      this.logger.warn(
        'SMTP non configuré — les emails (vérification, réinitialisation) seront affichés dans les logs.',
      );
      return;
    }
    try {
      // Loaded lazily: no hard dependency when mail is disabled.
      const nodemailer = await import('nodemailer');
      this.transport = nodemailer.createTransport({
        host: this.config.mail.host,
        port: this.config.mail.port,
        secure: this.config.mail.secure,
        auth: this.config.mail.user
          ? { user: this.config.mail.user, pass: this.config.mail.password }
          : undefined,
      }) as unknown as { sendMail: (opts: unknown) => Promise<unknown> };
      this.logger.log('Transport SMTP initialisé.');
    } catch (error) {
      this.logger.error(`Impossible d’initialiser SMTP: ${(error as Error).message}`);
    }
  }

  private link(path: string): string {
    return `${this.config.publicAppUrl.replace(/\/$/, '')}${path}`;
  }

  private async deliver(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.transport) {
      this.logger.log(`[MAIL:DEV] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    try {
      await this.transport.sendMail({
        from: this.config.mail.from,
        to,
        subject,
        html,
        text,
      });
    } catch (error) {
      this.logger.error(`Échec d’envoi email à ${to}: ${(error as Error).message}`);
    }
  }

  private layout(title: string, body: string): string {
    return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f7f9;padding:32px;font-family:Inter,system-ui,sans-serif;color:#0f1c24">
      <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td style="padding:28px 32px;border-bottom:1px solid #e6edf1">
          <strong style="font-size:17px;color:#035c80;letter-spacing:-0.01em">FolioForge</strong>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${title}</h1>
          <div style="font-size:15px;line-height:1.65;color:#3c4d58">${body}</div>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafb;font-size:12px;color:#7b8b96">
          Vous recevez cet email car une action a été initiée sur votre compte FolioForge.
        </td></tr>
      </table></body></html>`;
  }

  async sendEmailVerification(to: string, firstName: string, token: string): Promise<void> {
    const url = this.link(`/verifier-email?token=${encodeURIComponent(token)}`);
    await this.deliver(
      to,
      'Confirmez votre adresse email — FolioForge',
      this.layout(
        `Bienvenue ${this.escape(firstName)}`,
        `<p>Confirmez votre adresse email pour activer toutes les fonctionnalités de votre espace.</p>
         <p><a href="${url}" style="display:inline-block;background:#035c80;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Confirmer mon email</a></p>
         <p style="font-size:13px;color:#7b8b96">Ce lien expire dans 24 heures.</p>`,
      ),
      `Bienvenue ${firstName}. Confirmez votre email: ${url} (valide 24h)`,
    );
  }

  async sendPasswordReset(to: string, firstName: string, token: string): Promise<void> {
    const url = this.link(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`);
    await this.deliver(
      to,
      'Réinitialisation de votre mot de passe — FolioForge',
      this.layout(
        'Réinitialisez votre mot de passe',
        `<p>Bonjour ${this.escape(firstName)},</p>
         <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
         <p><a href="${url}" style="display:inline-block;background:#035c80;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Choisir un nouveau mot de passe</a></p>
         <p style="font-size:13px;color:#7b8b96">Si vous n’êtes pas à l’origine de cette demande, ignorez cet email. Le lien expire dans 1 heure.</p>`,
      ),
      `Réinitialisation du mot de passe: ${url} (valide 1h)`,
    );
  }

  async sendContactNotification(
    to: string,
    ownerName: string,
    from: { name: string; email: string; message: string },
  ): Promise<void> {
    await this.deliver(
      to,
      `Nouveau message de ${from.name} — FolioForge`,
      this.layout(
        'Vous avez reçu un nouveau message',
        `<p>Bonjour ${this.escape(ownerName)},</p>
         <p><strong>${this.escape(from.name)}</strong> (${this.escape(from.email)}) vous a écrit depuis votre portfolio :</p>
         <blockquote style="margin:16px 0;padding:14px 18px;background:#f5f8fa;border-left:3px solid #035c80;border-radius:6px;white-space:pre-wrap">${this.escape(from.message)}</blockquote>
         <p style="font-size:13px;color:#7b8b96">Répondez directement à ${this.escape(from.email)}.</p>`,
      ),
      `Nouveau message de ${from.name} <${from.email}>: ${from.message}`,
    );
  }

  async sendDonationReceipt(
    to: string,
    name: string,
    amount: string,
    provider: string,
  ): Promise<void> {
    await this.deliver(
      to,
      'Merci pour votre soutien — FolioForge',
      this.layout(
        'Merci pour votre soutien',
        `<p>Bonjour ${this.escape(name)},</p>
         <p>Nous avons bien reçu votre don de <strong>${this.escape(amount)}</strong> via ${this.escape(provider)}.</p>
         <p>Votre soutien contribue directement à l’hébergement, au développement et à l’accès gratuit de la plateforme pour les chercheurs d’emploi.</p>`,
      ),
      `Merci ${name}, don de ${amount} reçu via ${provider}.`,
    );
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
