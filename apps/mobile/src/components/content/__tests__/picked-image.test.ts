import { describe, expect, it } from 'vitest';
import { describePickedImage, describePickedVideo } from '../picked-image';

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

describe('vídeo escolhido no aparelho', () => {
  it('MOV do iPhone e MP4 do Android, pelo tipo ou pela extensão', () => {
    expect(
      describePickedVideo({ uri: 'file:///IMG_1.MOV', mimeType: 'video/quicktime', fileSize: 9 }),
    ).toEqual({ mime: 'video/quicktime', bytes: 9 });
    expect(describePickedVideo({ uri: 'content://media/VID_2.mp4' }, 4096)).toEqual({
      mime: 'video/mp4',
      bytes: 4096,
    });
  });

  it('outro formato ou mais de 200 MB vira recado', () => {
    expect(describePickedVideo({ uri: 'file:///a.webm', fileSize: 9 })).toEqual({
      problem: 'Escolha um vídeo MP4 ou MOV.',
    });
    expect(
      describePickedVideo({ uri: 'file:///a.mp4', fileSize: 300 * 1024 * 1024 }),
    ).toMatchObject({ problem: expect.stringMatching(/200 MB/) });
  });
});
