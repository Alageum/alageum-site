'use client';import LocaleElement from "@/components/locale/LocaleElement";

import { useEffect, useRef, useState } from 'react';

export default function HeroVideo() {
  const videoRef = useRef(null);
  const manuallyPaused = useRef(false);
  const userStarted = useRef(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    video.muted = true;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    function syncPlayback() {
      if (!visible || document.hidden || manuallyPaused.current || media.matches && !userStarted.current) video.pause();else
      video.play().catch(() => {});
    }
    const observer = new IntersectionObserver(([entry]) => {visible = entry.isIntersecting;syncPlayback();});
    observer.observe(video);
    media.addEventListener('change', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    video.addEventListener('canplay', syncPlayback);
    syncPlayback();
    return () => {observer.disconnect();media.removeEventListener('change', syncPlayback);document.removeEventListener('visibilitychange', syncPlayback);video.removeEventListener('canplay', syncPlayback);video.pause();};
  }, []);
  function togglePlayback() {
    const video = videoRef.current;
    if (video.paused) {manuallyPaused.current = false;userStarted.current = true;video.play().catch(() => {});} else
    {manuallyPaused.current = true;video.pause();}
  }
  return <LocaleElement as="figure" className="corp-hero-image corp-hero-video">
    <video ref={videoRef} autoPlay muted loop playsInline preload="metadata" poster="/video/alageum-upscaled-poster.webp" aria-hidden="true" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}><source src="/video/alageum-upscaled-4k.mp4" media="(min-width: 1440px)" type="video/mp4" /><source src="/video/alageum-upscaled-hd.mp4" media="(min-width: 761px)" type="video/mp4" /><source src="/video/alageum-upscaled-mobile.mp4" type="video/mp4" /></video>
    <LocaleElement as="button" type="button" className="hero-video-toggle" onClick={togglePlayback} aria-label={playing ? 'Приостановить фоновое видео' : 'Воспроизвести фоновое видео'}><LocaleElement as="span" aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</LocaleElement>{playing ? 'Пауза' : 'Смотреть'}</LocaleElement>
  </LocaleElement>;
}
