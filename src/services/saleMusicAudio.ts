export async function playAudioSegment(audio: HTMLAudioElement, startAt: number): Promise<void> {
  if (audio.readyState < 1) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('O MP3 demorou demais para carregar.')), 15_000);
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError);
        if (error) reject(error); else resolve();
      };
      const onLoaded = () => finish();
      const onError = () => finish(new Error('Não foi possível carregar o arquivo MP3.'));
      audio.addEventListener('loadedmetadata', onLoaded, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.load();
    });
  }
  if (Number.isFinite(audio.duration) && startAt >= audio.duration) {
    throw new Error('O início configurado está depois do final do arquivo MP3.');
  }
  audio.currentTime = startAt;
  await audio.play();
}
