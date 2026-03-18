import React, { useEffect, useState } from 'react';

type OnboardingStep = {
  stepLabel?: string;
  stepNumber?: number;
  title: string;
  description: string;
  videoSrc?: string;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to Klados',
    description: 'See how it works in a few quick steps.',
  },
  {
    stepLabel: 'Step 1',
    stepNumber: 1,
    title: 'Mini-Chats',
    description: 'Say goodbye to clutter',
    videoSrc: '/assets/demo1.mp4',
  },
  {
    stepLabel: 'Step 2',
    stepNumber: 2,
    title: "Goodbye 'Googling'",
    description: 'Everything explained with just 3 clicks',
    videoSrc: '/assets/demo2.mp4',
  },
  {
    stepLabel: 'Step 3',
    stepNumber: 3,
    title: 'Visualize in Node view',
    description: 'See all your branches in the node view',
    videoSrc: '/assets/demo3.mp4',
  },
];

const ONBOARDING_VIDEO_SRCS = ONBOARDING_STEPS.flatMap((step) => (step.videoSrc ? [step.videoSrc] : []));
const warmedOnboardingVideos = new Set<string>();
const hiddenPreloadVideos: HTMLVideoElement[] = [];

const warmOnboardingVideos = () => {
  if (typeof document === 'undefined') {
    return;
  }

  ONBOARDING_VIDEO_SRCS.forEach((src) => {
    if (warmedOnboardingVideos.has(src)) {
      return;
    }

    warmedOnboardingVideos.add(src);

    const preloadLink = document.createElement('link');
    preloadLink.rel = 'preload';
    preloadLink.as = 'video';
    preloadLink.href = src;
    preloadLink.type = 'video/mp4';
    document.head.appendChild(preloadLink);

    const preloadVideo = document.createElement('video');
    preloadVideo.preload = 'auto';
    preloadVideo.muted = true;
    preloadVideo.playsInline = true;
    preloadVideo.src = src;
    preloadVideo.load();
    hiddenPreloadVideos.push(preloadVideo);
  });
};

const Dots: React.FC<{ total: number; current: number }> = ({ total, current }) => (
  <div className="flex items-center gap-2">
    {Array.from({ length: total }).map((_, index) => (
      <span
        key={index}
        className={`rounded-full transition-all duration-300 ${
          index === current ? 'h-2.5 w-8 bg-[var(--accent-color)]' : 'h-2.5 w-2.5 bg-slate-300/90'
        }`}
      />
    ))}
  </div>
);

const VideoFallback: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center bg-white px-8 text-center text-lg text-[var(--app-text-muted)]">
    Drop `demo1.mp4`, `demo2.mp4`, and `demo3.mp4` into `public/assets`.
  </div>
);

const IntroSlideLayout: React.FC<{
  step: OnboardingStep;
  onSkip: () => void;
  onNext: () => void;
}> = ({ step, onSkip, onNext }) => (
  <div className="relative">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,163,127,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.10),transparent_30%)]" />

    <div className="relative space-y-4 px-6 pt-6 md:px-7 md:pt-7">
      <div className="absolute left-[3%] top-[6%] h-36 w-36 rounded-full bg-emerald-100/55 blur-3xl" />
      <div className="absolute bottom-[12%] right-[2%] h-40 w-40 rounded-full bg-sky-100/50 blur-3xl" />

      <div className="relative grid min-h-[220px] items-center gap-8 md:grid-cols-[1fr_170px]">
        <div className="max-w-[390px] space-y-4">
          <h2 className="text-[1.8rem] font-black leading-[0.98] tracking-tight text-[var(--app-text)] md:text-[2.15rem]">
            {step.title}
          </h2>
          <p className="max-w-[340px] text-[0.94rem] leading-7 text-[var(--app-text-muted)] md:max-w-[360px] md:text-[0.98rem]">
            {step.description}
          </p>
        </div>

        <div className="rounded-[24px] border border-white/85 bg-white/36 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[6px]">
          <div className="flex min-h-[120px] flex-col justify-center gap-3">
            <button
              type="button"
              onClick={onNext}
              className="rounded-full bg-[var(--accent-color)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_18px_36px_rgba(16,163,127,0.24)] transition-transform hover:scale-[1.01] active:scale-[0.98]"
            >
              Next
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full border border-[var(--border-color)] bg-white/80 px-5 py-2.5 text-[13px] font-semibold text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)]"
            >
              Skip
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border-color)]" />
    </div>
  </div>
);

const StepMedia: React.FC<{ step: OnboardingStep }> = ({ step }) => {
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setVideoFailed(false);
  }, [step.videoSrc]);

  if (!step.videoSrc) {
    return null;
  }

  if (videoFailed) {
    return <VideoFallback />;
  }

  return (
    <video
      key={step.videoSrc}
      className="block h-full w-full bg-white object-contain"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      onError={() => setVideoFailed(true)}
    >
      <source src={step.videoSrc} type="video/mp4" />
    </video>
  );
};

interface FirstRunOnboardingModalProps {
  isOpen: boolean;
  fullName?: string | null;
  onClose: () => void;
}

export const FirstRunOnboardingModal: React.FC<FirstRunOnboardingModalProps> = ({ isOpen, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    warmOnboardingVideos();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const currentStep = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const isIntroStep = !currentStep.videoSrc;
  const numberedStepCount = ONBOARDING_STEPS.filter((step) => typeof step.stepNumber === 'number').length;
  const goToNextStep = () => {
    if (isLastStep) {
      onClose();
      return;
    }

    setStepIndex((prev) => Math.min(ONBOARDING_STEPS.length - 1, prev + 1));
  };

  return (
    <div className="fixed inset-0 z-[420] flex items-center justify-center bg-slate-950/42 px-4 py-6 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-[620px] overflow-hidden rounded-[22px] border border-white/65 bg-[var(--card-bg)] shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        {isIntroStep ? (
          <IntroSlideLayout step={currentStep} onSkip={onClose} onNext={goToNextStep} />
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,163,127,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.10),transparent_30%)]" />

            <div className="relative h-[190px] border-b border-[var(--border-color)] bg-white md:h-[250px]">
              <StepMedia step={currentStep} />
            </div>

            <div className="relative space-y-5 px-5 py-5 md:px-6 md:py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  {currentStep.stepLabel ? (
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--app-text-muted)]">
                      {currentStep.stepLabel}
                    </p>
                  ) : null}
                  <h2 className="max-w-2xl text-[1.6rem] font-black leading-tight tracking-tight text-[var(--app-text)] md:text-[2rem]">
                    {currentStep.title}
                  </h2>
                  <p className="max-w-2xl text-[0.95rem] leading-6 text-[var(--app-text-muted)] md:text-base md:leading-7">
                    {currentStep.description}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="relative px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <Dots total={ONBOARDING_STEPS.length} current={stepIndex} />
              {typeof currentStep.stepNumber === 'number' ? (
                <span className="text-[13px] text-[var(--app-text-muted)]">
                  {currentStep.stepNumber} / {numberedStepCount}
                </span>
              ) : null}
            </div>

            {!isIntroStep ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-3 py-2.5 text-[13px] font-semibold text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)]"
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={stepIndex === 0}
                  className="rounded-full border border-[var(--border-color)] bg-white/80 px-4 py-2.5 text-[13px] font-semibold text-[var(--app-text)] transition-all hover:border-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={goToNextStep}
                  className="rounded-full bg-[var(--accent-color)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_18px_36px_rgba(16,163,127,0.24)] transition-transform hover:scale-[1.01] active:scale-[0.98]"
                >
                  {isLastStep ? 'Start Using Klados' : 'Next'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
