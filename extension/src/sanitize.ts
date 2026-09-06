/**
 * Strips path separators (and, by extension, any `..` traversal, which needs a
 * separator to mean anything) from an attachment-supplied filename, so it's safe
 * to use as a bare basename -- e.g. as a virtual-FS path segment or a save
 * dialog's default target.
 */
export function sanitizeAttachmentFilename(name: string): string {
  return name.replace(/[\\/]/g, '_') || 'attachment';
}
