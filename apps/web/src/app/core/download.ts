/**
 * Sauvegarde un blob côté client.
 *
 * On révoque systématiquement l'URL objet : sans ça, chaque téléchargement
 * retient le blob en mémoire jusqu'au rechargement de l'onglet.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Léger différé : Safari annule le téléchargement si l'URL est révoquée
  // dans le même tick.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nom de fichier sûr pour l'export (accents et espaces neutralisés). */
export function safeFilename(base: string, extension: string): string {
  const slug = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${slug || 'document'}.${extension}`;
}
