import { Pipe, type PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Rendu Markdown sécurisé pour les réponses de l'assistant.
 *
 * Le contenu vient d'un modèle de langage, donc il est traité comme non
 * fiable : `marked` produit le HTML, `DOMPurify` le nettoie avant
 * injection. Sans cette seconde étape, une réponse contenant du HTML
 * malveillant s'exécuterait dans la page — la désinfection n'est pas
 * optionnelle, même avec un modèle « de confiance ».
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    const raw = marked.parse(value, { async: false, breaks: true, gfm: true }) as string;
    const clean = DOMPurify.sanitize(raw, {
      // On interdit explicitement les vecteurs d'exécution classiques.
      FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
      ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
    });

    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
