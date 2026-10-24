import { describe, expect, it } from 'vitest';
import { getFilenameExt } from '@/utils.js';

describe('getFilenameExt', () => {
  it('returns the extension without the dot', () => {
    expect(getFilenameExt('video.mp4')).toBe('mp4');
  });

  it('returns only the last extension for multi-dot names', () => {
    expect(getFilenameExt('archive.tar.gz')).toBe('gz');
  });

  it('preserves case', () => {
    expect(getFilenameExt('IMAGE.PNG')).toBe('PNG');
  });

  it('returns an empty string when there is no extension', () => {
    expect(getFilenameExt('README')).toBe('');
    expect(getFilenameExt('trailingdot.')).toBe('');
  });

  it('treats dotfiles as having no extension', () => {
    expect(getFilenameExt('.env')).toBe('');
  });

  it('ignores directory components', () => {
    expect(getFilenameExt('some.dir/file')).toBe('');
    expect(getFilenameExt('some/dir/file.webm')).toBe('webm');
  });
});
