"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  getCondolences,
  addCondolence,
  getTrackStats,
  incrementTrackStat,
  CondolenceItem
} from "./actions";

interface Track {
  id: string;
  surah: string;
  reciter: string;
  url: string;
  filename: string;
}

const PLAYLIST: Track[] = [
  {
    id: 'fatiha',
    surah: 'سورة الفاتحة',
    reciter: 'الشيخ مشاري العفاسي',
    url: '/assets/audio/fatiha.mp3',
    filename: 'سورة-الفاتحة.mp3',
  },
  // {
  //   id: 'Suliaman',
  //   surah: 'ما تيسر من القرآن الكريم',
  //   reciter: 'سليمان أبو عنزة',
  //   url: '/assets/audio/suliaman.mp3',
  //   filename: 'سليمان.mp3',
  // },
  {
    id: 'ikhlas',
    surah: 'سورة الإخلاص',
    reciter: 'الشيخ مشاري العفاسي',
    url: '/assets/audio/ikhlas.mp3',
    filename: 'سورة-الإخلاص.mp3',
  },
  {
    id: 'falaq',
    surah: 'سورة الفلق',
    reciter: 'الشيخ مشاري العفاسي',
    url: '/assets/audio/falaq.mp3',
    filename: 'سورة-الفلق.mp3',
  },
  {
    id: 'nas',
    surah: 'سورة الناس',
    reciter: 'الشيخ مشاري العفاسي',
    url: '/assets/audio/nas.mp3',
    filename: 'سورة-الناس.mp3',
  }
];

// CondolenceItem is imported from ./actions

interface TrackStats {
  [trackId: string]: {
    plays: number;
    downloads: number;
  };
}

export default function Home() {
  // Navigation & Scroll
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("all");
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [playSessionCounted, setPlaySessionCounted] = useState(false);
  const [downloadingIndices, setDownloadingIndices] = useState<{ [key: number]: boolean }>({});

  // Database stats
  const [stats, setStats] = useState<TrackStats>({});

  // Condolences state
  const [condolences, setCondolences] = useState<CondolenceItem[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carousel
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Modals & Toast
  const [prayerModalOpen, setPrayerModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sentry and Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 3500);
  };

  const captureError = (action: string, error: unknown, extra: Record<string, unknown> = {}) => {
    console.error(`[Error: ${action}]`, error);
    const Sentry = (window as any).Sentry;
    if (!Sentry) return;
    const err = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
    Sentry.withScope((scope: any) => {
      scope.setTag('action', action);
      scope.setLevel('error');
      Object.entries(extra).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          scope.setExtra(key, value);
        }
      });
      Sentry.captureException(err);
    });
  };

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Section observer
  useEffect(() => {
    const sections = document.querySelectorAll("section[id]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  // Fetch initial track stats from SQLite
  const loadStats = async () => {
    try {
      const data = await getTrackStats();
      setStats(data);
    } catch (err) {
      console.warn("[SQLite stats load failed, falling back to local]", err);
      // Fallback local storage
      try {
        const local = localStorage.getItem("memorial_audio_stats_v2");
        if (local) {
          const parsed = JSON.parse(local);
          const loaded: TrackStats = {};
          PLAYLIST.forEach((t) => {
            loaded[t.id] = {
              plays: parsed.plays?.[t.id] || 0,
              downloads: parsed.downloads?.[t.id] || 0,
            };
          });
          setStats(loaded);
        }
      } catch { }
    }
  };

  // Fetch approved condolences
  const loadCondolences = async () => {
    try {
      const data = await getCondolences();
      setCondolences(data);
    } catch (err) {
      console.warn("[SQLite condolences load failed, falling back to local]", err);
      try {
        const local = localStorage.getItem("memorial_condolences_sulaiman");
        if (local) {
          const parsed = JSON.parse(local);
          setCondolences(parsed.reverse());
        }
      } catch { }
    }
  };

  // Initialize DB data
  useEffect(() => {
    loadStats();
    loadCondolences();

    // Query SQLite new condolences periodically (every 10 seconds)
    const interval = setInterval(() => {
      loadCondolences();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Shuffle order builder
  const shuffleArray = (array: number[]) => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const rebuildShuffleOrder = (index: number, enable: boolean) => {
    if (!enable) {
      setShuffleOrder([]);
      return;
    }
    const base = PLAYLIST.map((_, i) => i);
    const shuffled = shuffleArray(base);
    const currentPos = shuffled.indexOf(index);
    if (currentPos > 0) {
      shuffled.splice(currentPos, 1);
      shuffled.unshift(index);
    }
    setShuffleOrder(shuffled);
  };

  const getNextTrackIndex = () => {
    if (shuffleOn && shuffleOrder.length > 0) {
      const pos = shuffleOrder.indexOf(currentTrackIndex);
      if (pos !== -1 && pos < shuffleOrder.length - 1) {
        return shuffleOrder[pos + 1];
      }
      if (repeatMode === 'all') return shuffleOrder[0];
      return null;
    }
    if (currentTrackIndex < PLAYLIST.length - 1) return currentTrackIndex + 1;
    if (repeatMode === 'all') return 0;
    return null;
  };

  const getPrevTrackIndex = () => {
    if (shuffleOn && shuffleOrder.length > 0) {
      const pos = shuffleOrder.indexOf(currentTrackIndex);
      if (pos > 0) return shuffleOrder[pos - 1];
      if (repeatMode === 'all') return shuffleOrder[shuffleOrder.length - 1];
      return null;
    }
    if (currentTrackIndex > 0) return currentTrackIndex - 1;
    if (repeatMode === 'all') return PLAYLIST.length - 1;
    return null;
  };

  const playAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.play().catch((err) => {
      // Ignore play() request interruptions by pause()
      if (err.name === 'AbortError' || err.message?.includes('interrupted by a call to pause')) {
        console.warn('[AudioPlayer] play interrupted by pause (harmless)');
        return;
      }
      captureError('audio_play', err, {
        track_id: PLAYLIST[currentTrackIndex].id,
        url: PLAYLIST[currentTrackIndex].url,
      });
      showToast('تعذّر تشغيل الملف الصوتي');
      setIsPlaying(false);
    });
  };

  const loadTrack = (index: number, autoplay = false) => {
    setCurrentTrackIndex(index);
    setPlaySessionCounted(false);
    setProgress(0);
    setCurrentTime(0);

    if (audioRef.current) {
      audioRef.current.src = PLAYLIST[index].url;
      audioRef.current.load();
      if (autoplay) {
        setIsPlaying(true);
        // Browser requires a tiny tick after load to trigger play sometimes
        setTimeout(() => {
          playAudio();
        }, 50);
      } else {
        setIsPlaying(false);
      }
    }
  };

  // Sync shuffle position
  useEffect(() => {
    if (shuffleOn && shuffleOrder.length > 0) {
      const pos = shuffleOrder.indexOf(currentTrackIndex);
      if (pos === -1) {
        rebuildShuffleOrder(currentTrackIndex, true);
      }
    }
  }, [currentTrackIndex, shuffleOn]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playAudio();
    }
  };

  const handleNext = () => {
    const next = getNextTrackIndex();
    if (next !== null) {
      loadTrack(next, true);
    }
  };

  const handlePrev = () => {
    const prev = getPrevTrackIndex();
    if (prev !== null) {
      loadTrack(prev, true);
    }
  };

  const toggleShuffle = () => {
    const nextShuffle = !shuffleOn;
    setShuffleOn(nextShuffle);
    rebuildShuffleOrder(currentTrackIndex, nextShuffle);
  };

  const toggleRepeat = () => {
    const modes: ("off" | "all" | "one")[] = ["off", "all", "one"];
    const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
    setRepeatMode(modes[nextIndex]);
  };

  // Update repeat loop in native element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = repeatMode === "one";
    }
  }, [repeatMode]);

  // DB Increment Helper
  const incrementStatInDB = async (event: 'play' | 'download', trackId: string) => {
    // Update local cache state immediately
    setStats((prev) => {
      const track = prev[trackId] || { plays: 0, downloads: 0 };
      return {
        ...prev,
        [trackId]: {
          ...track,
          plays: event === 'play' ? track.plays + 1 : track.plays,
          downloads: event === 'download' ? track.downloads + 1 : track.downloads,
        }
      };
    });

    try {
      const res = await incrementTrackStat(trackId, event);
      if (!res.ok) throw new Error(res.error);
    } catch (err) {
      captureError('audio_stats_persist', err, { event, track_id: trackId });
      // Update local storage fallback
      try {
        const local = localStorage.getItem("memorial_audio_stats_v2");
        const parsed = local ? JSON.parse(local) : { plays: {}, downloads: {} };
        if (event === 'play') {
          parsed.plays[trackId] = (parsed.plays[trackId] || 0) + 1;
        } else {
          parsed.downloads[trackId] = (parsed.downloads[trackId] || 0) + 1;
        }
        localStorage.setItem("memorial_audio_stats_v2", JSON.stringify(parsed));
      } catch { }
    }
  };

  const downloadTrack = async (index: number) => {
    const track = PLAYLIST[index];
    const filename = track.filename || `${track.surah.replace(/\s+/g, '-')}.mp3`;

    setDownloadingIndices((prev) => ({ ...prev, [index]: true }));
    showToast('جاري تحضير التحميل...');

    try {
      const response = await fetch(track.url);
      if (!response.ok) throw new Error('fetch failed');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(blobUrl);

      await incrementStatInDB('download', track.id);
      showToast('تم بدء التحميل');
    } catch (err) {
      captureError('audio_download', err, { track_id: track.id, url: track.url });

      // Fallback simple link click
      const link = document.createElement('a');
      link.href = track.url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();

      await incrementStatInDB('download', track.id);
      showToast('تعذّر التحميل المباشر — تم فتح الملف');
    } finally {
      setDownloadingIndices((prev) => ({ ...prev, [index]: false }));
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleAudioTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    setCurrentTime(cur);
    if (duration) {
      setProgress((cur / duration) * 100);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    setDuration(dur);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setProgress(val);
    if (audioRef.current && duration) {
      audioRef.current.currentTime = (val / 100) * duration;
    }
  };

  const handleAudioPlay = () => {
    setIsPlaying(true);
    if (!playSessionCounted) {
      incrementStatInDB('play', PLAYLIST[currentTrackIndex].id);
      setPlaySessionCounted(true);
    }
  };

  const handleAudioEnded = () => {
    if (repeatMode === 'one') return;
    const next = getNextTrackIndex();
    if (next !== null) {
      loadTrack(next, true);
    } else {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    }
  };

  // Submit condolence
  const handleCondolenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = messageInput.trim();
    const visitorName = nameInput.trim() || 'زائر كريم';

    if (!message) return;
    if (message.length > 400) {
      showToast('الحد الأقصى 400 حرفاً');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await addCondolence(visitorName, message);
      if (!result.ok || !result.data) throw new Error(result.error);

      const item: CondolenceItem = {
        id: result.data.id,
        name: result.data.name,
        message: result.data.message,
        date: result.data.date,
      };

      setCondolences((prev) => {
        if (prev.some((c) => c.id === item.id)) return prev;
        return [item, ...prev];
      });

      setNameInput("");
      setMessageInput("");
      showToast('تم إرسال تعزيتك — ستظهر في السيرة والذكريات');
    } catch (err) {
      captureError('condolence_submit', err, { message_length: message.length });

      // Local storage fallback
      try {
        const local = localStorage.getItem("memorial_condolences_sulaiman");
        const parsed: CondolenceItem[] = local ? JSON.parse(local) : [];
        const item: CondolenceItem = {
          id: `local-${Date.now()}`,
          name: visitorName,
          message,
          date: new Date().toISOString(),
        };
        parsed.push(item);
        localStorage.setItem("memorial_condolences_sulaiman", JSON.stringify(parsed));

        setCondolences(parsed.slice().reverse());
        setNameInput("");
        setMessageInput("");
        showToast('تم إرسال تعزيتك — ستظهر في السيرة والذكريات');
      } catch {
        showToast('تعذّر إرسال التعزية — حاول مرة أخرى');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carousel handlers
  const goToCarouselSlide = (index: number, smooth = true) => {
    const slides = carouselRef.current?.querySelectorAll('.memory-slide');
    if (!slides || !slides.length) return;
    const targetIndex = Math.max(0, Math.min(index, slides.length - 1));
    setCarouselIndex(targetIndex);

    slides[targetIndex].scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      inline: 'start',
      block: 'nearest',
    });
  };

  // Auto carousel slide observer
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    const slides = container.querySelectorAll('.memory-slide');
    if (!slides.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            const idx = Array.from(slides).indexOf(entry.target);
            if (idx !== -1) {
              setCarouselIndex(idx);
            }
          }
        });
      },
      { root: container, threshold: [0.55, 0.75, 1] }
    );

    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [condolences]);

  // Carousel Pagination helpers
  const CAROUSEL_WINDOW_SIZE = 3;
  const CAROUSEL_SHOW_ALL_DOTS = 7;

  const dotIndices = useMemo(() => {
    const total = condolences.length;
    if (total <= CAROUSEL_SHOW_ALL_DOTS) {
      return Array.from({ length: total }, (_, i) => i);
    }
    let start = carouselIndex - 1;
    if (start < 0) start = 0;
    if (start > total - CAROUSEL_WINDOW_SIZE) {
      start = total - CAROUSEL_WINDOW_SIZE;
    }
    return Array.from({ length: CAROUSEL_WINDOW_SIZE }, (_, offset) => start + offset);
  }, [carouselIndex, condolences.length]);

  const getDotState = (index: number) => {
    const distance = Math.abs(index - carouselIndex);
    if (distance === 0) return 'active';
    if (distance === 1) return 'near';
    return 'far';
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleSharePrayerClick = () => {
    setPrayerModalOpen(false);
    setMessageInput('اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ، وَعَافِهِ وَاعْفُ عَنْهُ، وَأَكْرِمْ نُزُلَهُ، وَوَسِّعْ مَدْخَلَهُ.');
    const formSec = document.getElementById('condolences');
    if (formSec) {
      formSec.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={handleAudioPlay}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleAudioTimeUpdate}
        onLoadedMetadata={handleAudioLoadedMetadata}
        onEnded={handleAudioEnded}
        onError={(e) => {
          const err = (e.target as HTMLAudioElement).error;
          captureError('audio_load', err, {
            track_id: PLAYLIST[currentTrackIndex]?.id,
            src: PLAYLIST[currentTrackIndex]?.url,
          });
          showToast('تعذّر تشغيل الملف الصوتي');
          setIsPlaying(false);
        }}
      />

      {/* شريط التنقل */}
      <header
        id="header"
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "scrolled" : "bg-transparent"
          }`}
      >
        <nav className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <a href="#hero" className="font-cairo text-lg text-white/90 hover:text-memorial-gold transition-colors">
            في ذكرى سليمان أبو عنزة
          </a>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white/90 p-2 focus:outline-none"
            aria-label="فتح القائمة"
            aria-expanded={mobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <ul id="nav-links" className="hidden md:flex gap-8 text-sm text-white/80">
            <li>
              <a
                href="#biography"
                className={`nav-link hover:text-memorial-gold transition-colors ${activeSection === "biography" ? "active" : ""
                  }`}
              >
                السيرة
              </a>
            </li>
            <li>
              <a
                href="#quran"
                className={`nav-link hover:text-memorial-gold transition-colors ${activeSection === "quran" ? "active" : ""
                  }`}
              >
                تلاوات من القرآن
              </a>
            </li>
            <li>
              <a
                href="#condolences"
                className={`nav-link hover:text-memorial-gold transition-colors ${activeSection === "condolences" ? "active" : ""
                  }`}
              >
                سجل التعازي
              </a>
            </li>
          </ul>
        </nav>
        {/* قائمة الجوال */}
        <div
          id="mobile-menu"
          className={`${mobileMenuOpen ? "block" : "hidden"
            } md:hidden bg-memorial-navy/95 backdrop-blur-sm border-t border-white/10`}
        >
          <ul className="flex flex-col px-5 py-4 gap-4 text-white/90 text-sm">
            <li>
              <a
                href="#biography"
                onClick={() => setMobileMenuOpen(false)}
                className="mobile-nav-link block py-2"
              >
                السيرة والذكريات
              </a>
            </li>
            <li>
              <a
                href="#quran"
                onClick={() => setMobileMenuOpen(false)}
                className="mobile-nav-link block py-2"
              >
                تلاوات من القرآن — صدقة جارية
              </a>
            </li>
            <li>
              <a
                href="#condolences"
                onClick={() => setMobileMenuOpen(false)}
                className="mobile-nav-link block py-2"
              >
                سجل التعازي
              </a>
            </li>
          </ul>
        </div>
      </header>

      <main>
        {/* ═══ قسم المقدمة ═══ */}
        <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-memorial-deep">
            <div className="absolute inset-0 bg-gradient-to-b from-memorial-navy/80 via-memorial-deep/90 to-memorial-deep"></div>
            <div className="absolute inset-0 opacity-[0.03] noise-texture"></div>
          </div>

          <div className="relative z-10 max-w-5xl mx-auto px-5 py-32 text-center">
            <div className="mb-10 flex justify-center">
              <div className="photo-frame">
                <img
                  src="/assets/images/person.png"
                  alt="صورة سليمان أبو عنزة — رحمه الله"
                  className="memorial-photo w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60 rounded-full object-cover object-center"
                />
              </div>
            </div>

            <p className="text-memorial-gold text-sm tracking-widest mb-4 opacity-90">
              إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ
            </p>

            <h1 className="font-cairo text-4xl sm:text-5xl md:text-6xl text-white leading-tight mb-6">
              سليمان أبو عنزة
            </h1>

            <p className="font-cairo text-xl sm:text-2xl text-white/70 italic max-w-2xl mx-auto leading-relaxed mb-8">
              «اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ، وَعَافِهِ وَاعْفُ عَنْهُ،
              وَأَكْرِمْ نُزُلَهُ، وَوَسِّعْ مَدْخَلَهُ»
            </p>

            <p className="text-white/50 text-sm max-w-lg mx-auto leading-loose">
              هذه الصفحة وُضِعت لتخليد ذكراه الطيبة، ومشاركة ذكرياته الجميلة،
              والدعاء له بالرحمة والمغفرة.
            </p>

            <a
              href="#biography"
              className="inline-block mt-12 text-memorial-gold/80 hover:text-memorial-gold transition-colors animate-bounce-subtle"
              aria-label="انتقل إلى السيرة"
            >
              <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </section>

        {/* ═══ قسم السيرة والذكريات ═══ */}
        <section id="biography" className="py-20 sm:py-28 bg-white">
          <div className="max-w-3xl mx-auto px-5">
            <div className="text-center mb-14">
              <span className="text-memorial-gold text-sm tracking-widest">عن حياته</span>
              <h2 className="font-cairo text-3xl sm:text-4xl text-memorial-deep mt-3">
                السيرة والذكريات
              </h2>
              <div className="w-16 h-px bg-memorial-gold/50 mx-auto mt-6"></div>
            </div>

            <article className="prose-memorial space-y-6 text-memorial-slate leading-loose text-base sm:text-lg">
              <p>
                كان سليمان أبو عنزة — رحمه الله — من أهل الخير والبر، يُعرف بين معارفه
                بأخلاقه الحسنة وابتسامته الدافئة. عاش حياته بتواضع وإخلاص، وترك
                في قلوب من عرفوه أثراً لا يُمحى.
              </p>
              <p>
                كان يحب مساعدة الآخرين دون أن ينتظر الشكر، ويُذكر دائماً بكلماته
                الطيبة وصبره في الشدائد. كان قريباً من قلبه القرآن الكريم،
                ويحرص على أداء الصلاة في وقتها.
              </p>
              <p>
                نتذكره في التجمعات بضحكاته. كان أخاً وفياً، وصديقاً عزيزاً.
              </p>
              <div className="mt-8 pt-8 border-t border-memorial-gold/30 text-center space-y-4">
                <p className="text-memorial-deep leading-loose">
                  توفي{" "}
                  <time dateTime="2026-06-24T08:30">٧ أكتوبر ٢٠٢٣ — في حرب الاحتلال مع غزة</time> إثر الإشتباكات مع الاحتلال الغاشم
                  — رحمه الله.
                </p>
                <p className="text-memorial-navy/85 leading-relaxed">
                  اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ، وَأَدْخِلْهُ فِسِيحَ جَنَّاتِكَ.
                </p>
                <p className="text-memorial-gold text-sm tracking-wide">
                  نسألكم الدعاء له.
                </p>
              </div>
            </article>

            {/* كلمات من الأحباء — carousel */}
            <div className="mt-16 memories-carousel-wrap">
              <p className="text-center text-memorial-gold text-sm tracking-widest mb-6">
                كلمات من الأحباء
              </p>

              {condolences.length === 0 ? (
                <p id="memories-empty" className="text-center text-memorial-slate/50 py-8">
                  كن أول من يكتب كلمة طيبة في سجل التعازي.
                </p>
              ) : (
                <div id="memories-carousel-host">
                  <div className="memories-carousel-viewport">
                    <div
                      ref={carouselRef}
                      id="memories-carousel"
                      className="memories-carousel"
                      aria-live="polite"
                      tabIndex={0}
                    >
                      {condolences.map((item) => (
                        <article key={item.id} className="memory-slide memory-card">
                          <p className="memory-slide__message">{item.message}</p>
                          <footer className="memory-slide__meta">
                            <span className="memory-slide__name">{item.name}</span>
                            <time className="memory-slide__date" dateTime={item.date}>
                              {formatDate(item.date)}
                            </time>
                          </footer>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="carousel-controls">
                    <button
                      type="button"
                      onClick={() => goToCarouselSlide(carouselIndex - 1)}
                      disabled={carouselIndex <= 0}
                      id="carousel-prev"
                      className="carousel-btn"
                      aria-label="السابق"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div className="carousel-pagination">
                      <span id="carousel-counter" className="carousel-counter" aria-live="polite">
                        {carouselIndex + 1} من {condolences.length}
                      </span>
                      <div id="carousel-dots" className="carousel-dots">
                        {dotIndices.map((idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => goToCarouselSlide(idx)}
                            className={`carousel-dot ${getDotState(idx)}`}
                            aria-label={`تعزية ${idx + 1}`}
                            aria-current={idx === carouselIndex ? "true" : undefined}
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => goToCarouselSlide(carouselIndex + 1)}
                      disabled={carouselIndex >= condolences.length - 1}
                      id="carousel-next"
                      className="carousel-btn"
                      aria-label="التالي"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══ قسم المصحف — صدقة جارية ═══ */}
        <section id="quran" className="py-20 sm:py-28 bg-memorial-deep text-white">
          <div className="max-w-3xl mx-auto px-5">
            <div className="text-center mb-14">
              <span className="text-memorial-gold text-sm tracking-widest">صدقة جارية</span>
              <h2 className="font-cairo text-3xl sm:text-4xl mt-3">تلاوات من القرآن الكريم</h2>
              <p className="text-white/50 mt-4 max-w-lg mx-auto leading-relaxed">
                استمع إلى تلاوات من القرآن الكريم، وادعُ له بالرحمة والمغفرة.
                كل آية تُسمَع صدقة جارية بإذن الله.
              </p>
              <div className="w-16 h-px bg-memorial-gold/50 mx-auto mt-6"></div>
            </div>

            {/* مشغل الصوت */}
            <div className="audio-player rounded-2xl bg-memorial-navy/60 border border-white/10 p-6 sm:p-8 backdrop-blur-sm">
              <div className="text-center mb-6">
                <p id="current-surah" className="font-cairo text-2xl text-memorial-goldLight">
                  {PLAYLIST[currentTrackIndex].surah}
                </p>
                <p id="current-reciter" className="text-white/40 text-sm mt-1">
                  {PLAYLIST[currentTrackIndex].reciter}
                </p>
                <p id="current-track-stats" className="track-stats track-stats--current mt-3">
                  <span className="track-stat" title="مرات التشغيل">
                    <svg className="track-stat-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {stats[PLAYLIST[currentTrackIndex].id]?.plays || 0}
                  </span>
                  <span className="track-stat" title="مرات التحميل">
                    <svg className="track-stat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                    </svg>
                    {stats[PLAYLIST[currentTrackIndex].id]?.downloads || 0}
                  </span>
                </p>
              </div>

              <div className="audio-controls" dir="ltr">
                <div className="mb-6">
                  <input
                    type="range"
                    id="progress-bar"
                    className="progress-range w-full"
                    value={progress}
                    onChange={handleProgressChange}
                    min="0"
                    max="100"
                    aria-label="تقدم التلاوة"
                  />
                  <div className="flex justify-between text-xs text-white/40 mt-2">
                    <span id="current-time">{formatTime(currentTime)}</span>
                    <span id="duration-time">{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="player-transport mb-8">
                  <button
                    onClick={toggleShuffle}
                    type="button"
                    className={`mode-btn ${shuffleOn ? 'is-active' : ''}`}
                    aria-label="تشغيل عشوائي"
                    aria-pressed={shuffleOn}
                    title="تشغيل عشوائي"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                    </svg>
                  </button>

                  <div className="player-transport-main">
                    <button
                      onClick={handlePrev}
                      disabled={getPrevTrackIndex() === null}
                      id="prev-btn"
                      className="control-btn"
                      aria-label="التلاوة السابقة"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
                      </svg>
                    </button>
                    <button onClick={togglePlay} id="play-btn" className="play-btn" aria-label="تشغيل / إيقاف">
                      {!isPlaying ? (
                        <svg id="play-icon" className="w-7 h-7 play-icon-offset" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg id="pause-icon" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={getNextTrackIndex() === null}
                      id="next-btn"
                      className="control-btn"
                      aria-label="التلاوة التالية"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                      </svg>
                    </button>
                  </div>

                  <button
                    onClick={toggleRepeat}
                    type="button"
                    className={`mode-btn mode-btn--repeat ${repeatMode !== 'off' ? 'is-active' : ''}`}
                    aria-label={repeatMode === 'one' ? 'تكرار المقطع الحالي' : repeatMode === 'all' ? 'تكرار الكل' : 'إيقاف التكرار'}
                    title={repeatMode === 'one' ? 'تكرار المقطع الحالي' : repeatMode === 'all' ? 'تكرار الكل' : 'إيقاف التكرار'}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                    </svg>
                    {repeatMode === 'one' && (
                      <span id="repeat-one-badge" className="repeat-one-badge" aria-hidden="true">1</span>
                    )}
                  </button>
                </div>

                <div className="text-center mb-8">
                  <button
                    onClick={() => downloadTrack(currentTrackIndex)}
                    disabled={downloadingIndices[currentTrackIndex]}
                    id="download-current-btn"
                    type="button"
                    className="download-btn"
                    dir="rtl"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                    </svg>
                    {downloadingIndices[currentTrackIndex] ? "جاري التحميل..." : "تحميل التلاوة الحالية"}
                  </button>
                </div>
              </div>

              {/* قائمة السور */}
              <div>
                <p className="text-white/40 text-sm mb-3">اختر التلاوة أو حمّلها:</p>
                <ul id="playlist" className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {PLAYLIST.map((track, i) => (
                    <li key={track.id} className={`playlist-item ${i === currentTrackIndex ? 'active' : ''}`}>
                      <button
                        type="button"
                        onClick={() => loadTrack(i, true)}
                        className="playlist-play"
                        aria-label={`تشغيل ${track.surah}`}
                      >
                        <span className="playlist-main">
                          <span className="playlist-row">
                            <span className="track-num">{i + 1}</span>
                            <span className="playlist-text">{track.surah}</span>
                            <span className="playlist-reciter">{track.reciter}</span>
                          </span>
                          <span className="track-stats">
                            <span className="track-stat" title="مرات التشغيل">
                              <svg className="track-stat-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                              {stats[track.id]?.plays || 0}
                            </span>
                            <span className="track-stat" title="مرات التحميل">
                              <svg className="track-stat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                              </svg>
                              {stats[track.id]?.downloads || 0}
                            </span>
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTrack(i)}
                        disabled={downloadingIndices[i]}
                        className="download-track-btn"
                        aria-label={`تحميل ${track.surah}`}
                        title="تحميل"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* زر طلب الدعاء */}
            <div className="text-center mt-10">
              <button onClick={() => setPrayerModalOpen(true)} id="prayer-btn" className="prayer-btn">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                ادعُ له بالرحمة
              </button>
            </div>
          </div>
        </section>

        {/* ═══ قسم سجل التعازي ═══ */}
        <section id="condolences" className="py-20 sm:py-28 bg-memorial-mist">
          <div className="max-w-3xl mx-auto px-5">
            <div className="text-center mb-14">
              <span className="text-memorial-gold text-sm tracking-widest">كلمات من القلب</span>
              <h2 className="font-cairo text-3xl sm:text-4xl text-memorial-deep mt-3">
                سجل التعازي
              </h2>
              <p className="text-memorial-slate/70 mt-4 max-w-lg mx-auto leading-relaxed">
                اكتب دعوة أو كلمة طيبة تُخلّد ذكراه. ستظهر كلمتك في قسم{" "}
                <a href="#biography" className="text-memorial-gold hover:underline">السيرة والذكريات</a>.
              </p>
              <div className="w-16 h-px bg-memorial-gold/50 mx-auto mt-6"></div>
            </div>

            {/* نموذج إضافة تعزية */}
            <form
              onSubmit={handleCondolenceSubmit}
              id="condolence-form"
              className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-memorial-mist"
            >
              <div className="space-y-5">
                <div>
                  <label htmlFor="visitor-name" className="block text-sm text-memorial-slate mb-2">
                    اسمك <span className="text-memorial-slate/50">(اختياري)</span>
                  </label>
                  <input
                    type="text"
                    id="visitor-name"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={80}
                    placeholder="اكتب اسمك هنا — أو اتركه فارغاً"
                    className="form-input"
                  />
                </div>
                <div>
                  <label htmlFor="visitor-message" className="block text-sm text-memorial-slate mb-2">
                    دعوتك أو كلمتك
                  </label>
                  <textarea
                    id="visitor-message"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    required
                    maxLength={400}
                    rows={4}
                    placeholder="اللهم اغفر له وارحمه..."
                    className="form-input resize-none"
                  />
                  <p className="text-xs text-memorial-slate/50 mt-2 text-left" dir="ltr">
                    <span>{messageInput.length}</span> / 400
                  </p>
                </div>
                <button type="submit" disabled={isSubmitting} className="submit-btn w-full sm:w-auto">
                  {isSubmitting ? "جاري الإرسال..." : "إرسال التعزية"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      {/* تذييل */}
      <footer className="bg-memorial-deep text-white/40 text-center py-10 px-5 text-sm">
        <p className="font-cairo text-white/60 text-lg mb-2">
          اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ
        </p>
        <p>صفحة ذكرى — سليمان أبو عنزة</p>
        <p className="mt-2 text-xs text-white/25">صُممت بمحبة وتقدير</p>
      </footer>

      {/* نافذة الدعاء */}
      {prayerModalOpen && (
        <div id="prayer-modal" className="modal" role="dialog" aria-modal="true" aria-labelledby="prayer-title">
          <div onClick={() => setPrayerModalOpen(false)} className="modal-backdrop"></div>
          <div className="modal-content">
            <button onClick={() => setPrayerModalOpen(false)} id="close-prayer" className="modal-close" aria-label="إغلاق">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 id="prayer-title" className="font-cairo text-2xl text-memorial-deep mb-6 text-center">
              ادعُ له
            </h3>
            <div className="space-y-4 text-memorial-slate leading-loose text-base">
              <p className="font-cairo text-lg text-center text-memorial-navy">
                اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ، وَعَافِهِ وَاعْفُ عَنْهُ،
                وَأَكْرِمْ نُزُلَهُ، وَوَسِّعْ مَدْخَلَهُ، وَاغْسِلْهُ بِالْمَاءِ
                وَالثَّلْجِ وَالْبَرَدِ، وَنَقِّهِ مِنَ الْخَطَايَا كَمَا يُنَقي
                الثَّوْبَ الأَبْيَضَ مِنَ الدَّنَسِ.
              </p>
              <p className="font-cairo text-lg text-center text-memorial-navy">
                اللَّهُمَّ أَبْدِلْهُ دَاراً خَيْراً مِنْ دَارِهِ، وَأَهْلاً خَيْراً
                مِنْ أَهْلِهِ، وَزَوْجه من الحور العين، وَأَدْخِلْهُ
                الْجَنَّةَ، وَأَعِذْهُ مِنْ عَذَابِ الْقَبْرِ وَعَذَابِ النَّارِ.
              </p>
            </div>
            <button onClick={handleSharePrayerClick} id="share-prayer" className="submit-btn w-full mt-8">
              شارك دعاءك في سجل التعازي
            </button>
          </div>
        </div>
      )}

      {/* رسالة نجاح */}
      <div id="toast" className={`toast ${toastVisible ? "" : "hidden"}`} role="status" aria-live="polite">
        {toastMessage}
      </div>
    </>
  );
}
