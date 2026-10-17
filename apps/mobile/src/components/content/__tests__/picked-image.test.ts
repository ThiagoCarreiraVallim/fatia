import { describe, expect, it } from 'vitest';
import { describePickedImage } from '../picked-image';

describe('imagem escolhida no aparelho', () => {
  it('usa o tipo e o tamanho que o seletor informou', () => {
    expect(
      describePickedImage({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 2048 }),
    ).toEqual({ mime: 'image/jpeg', bytes: 2048 });
  });

  it('sem tipo, deduz pela extensão; o tamanho medido vale mais que o informado', () => {
    expect(describePickedImage({ uri: 'content://x/IMG_1.PNG?y=1', fileSize: 1 }, 5000)).toEqual({
      mime: 'image/png',
      bytes: 5000,
    });
  });

  it('HEIC e imagem grande demais viram recado, não envio', () => {
    expect(describePickedImage({ uri: 'file:///a.heic', fileSize: 10 })).toEqual({
      problem: 'Escolha uma imagem JPEG, PNG ou WebP.',
    });
    expect(
      describePickedImage({
        uri: 'file:///a.jpg',
        mimeType: 'image/jpeg',
        fileSize: 11 * 1024 * 1024,
      }),
    ).toEqual({ problem: 'A imagem passa de 10 MB. Escolha uma menor.' });
  });
});
