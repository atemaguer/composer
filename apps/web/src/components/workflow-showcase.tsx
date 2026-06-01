"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import { useRef, useState } from "react";

import {
  ParallelMock,
  WorkflowMock,
  type MiniStep,
} from "@/components/composer-mock";
import { EASE_OUT } from "@/components/motion/motion-presets";
import { Reveal, RevealItem } from "@/components/motion/reveal";

export type Workflow = {
  step: string;
  title: string;
  description: string;
  outcome: string;
  steps?: MiniStep[];
  parallel?: boolean;
};

function Stage({ workflow }: { workflow: Workflow }) {
  return workflow.parallel ? (
    <ParallelMock />
  ) : (
    <WorkflowMock steps={workflow.steps ?? []} />
  );
}

/**
 * Sticky, scroll-driven stepper (Linear-style): the step list pins on the left
 * and the active step expands while a large stage on the right crossfades the
 * matching product mock. A rail fills with scroll progress. Desktop only — the
 * mobile / reduced-motion path uses the stacked fallback below.
 */
function StickyStepper({ workflows }: { workflows: Workflow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });
  const railScaleY = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const index = Math.min(
      workflows.length - 1,
      Math.max(0, Math.floor(progress * workflows.length))
    );
    setActive(index);
  });

  function goTo(index: number) {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const top = el.getBoundingClientRect().top + window.scrollY;
    const segment = el.offsetHeight / workflows.length;
    window.scrollTo({
      top: top + segment * index + segment / 2 - window.innerHeight / 2,
      behavior: "smooth",
    });
  }

  const current = workflows[active] ?? workflows[0];

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: `${workflows.length * 90}vh` }}
    >
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="relative">
            <div className="absolute bottom-1 left-0 top-1 w-px bg-line">
              <motion.div
                style={{ scaleY: railScaleY }}
                className="absolute inset-0 origin-top bg-gradient-to-b from-accent to-accent-deep"
              />
            </div>
            <ul className="flex flex-col gap-1.5 pl-8">
              {workflows.map((workflow, index) => {
                const isActive = index === active;
                return (
                  <li key={workflow.title}>
                    <button
                      type="button"
                      onClick={() => goTo(index)}
                      className="group block w-full py-2 text-left"
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className="flex items-baseline gap-3">
                        <span
                          className={`eyebrow transition-colors ${
                            isActive ? "text-accent" : "text-ink-faint"
                          }`}
                        >
                          {workflow.step}
                        </span>
                        <span
                          className={`text-[1.2rem] font-semibold tracking-[-0.01em] transition-colors sm:text-[1.4rem] ${
                            isActive
                              ? "text-ink"
                              : "text-ink-faint group-hover:text-ink-soft"
                          }`}
                        >
                          {workflow.title}
                        </span>
                      </div>
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.35, ease: EASE_OUT }}
                            className="overflow-hidden"
                          >
                            <p className="mt-3 max-w-md text-[14.5px] leading-7 text-ink-soft">
                              {workflow.description}
                            </p>
                            <div className="mt-4 flex items-center gap-2.5 text-[13.5px] font-medium text-accent">
                              <span
                                className="h-px w-7 bg-accent"
                                aria-hidden="true"
                              />
                              {workflow.outcome}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="feature-stage relative overflow-hidden p-6 sm:p-9">
            <div className="relative flex min-h-[380px] items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                  className="w-full [filter:drop-shadow(0_24px_44px_rgba(0,0,0,0.55))]"
                >
                  <Stage workflow={current} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Plain stacked layout for mobile and reduced motion — fully visible. */
function StackedWorkflows({ workflows }: { workflows: Workflow[] }) {
  return (
    <div className="mx-auto mt-16 flex max-w-2xl flex-col gap-16 px-5 sm:gap-20 sm:px-8">
      {workflows.map((workflow) => (
        <Reveal key={workflow.title} stagger>
          <RevealItem>
            <span className="eyebrow text-accent">{workflow.step}</span>
            <h3 className="mt-3 text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.01em] text-ink sm:text-[1.8rem]">
              {workflow.title}
            </h3>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-ink-soft">
              {workflow.description}
            </p>
            <div className="mt-5 flex items-center gap-2.5 text-[14px] font-medium text-accent">
              <span className="h-px w-7 bg-accent" aria-hidden="true" />
              {workflow.outcome}
            </div>
          </RevealItem>
          <RevealItem className="mt-7">
            <div className="feature-stage p-6 sm:p-8">
              <div className="relative [filter:drop-shadow(0_24px_44px_rgba(0,0,0,0.55))]">
                <Stage workflow={workflow} />
              </div>
            </div>
          </RevealItem>
        </Reveal>
      ))}
    </div>
  );
}

export function WorkflowShowcase({ workflows }: { workflows: Workflow[] }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <StackedWorkflows workflows={workflows} />;
  }

  return (
    <>
      <div className="hidden lg:block">
        <StickyStepper workflows={workflows} />
      </div>
      <div className="lg:hidden">
        <StackedWorkflows workflows={workflows} />
      </div>
    </>
  );
}
