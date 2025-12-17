import { useEffect, useMemo } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

import type { OnboardingStatusResponse } from '../api';
import { EMPTY_PROFILE, type ProfileFormValues } from '../lib/profile';

const PROFILE_STEP_ID = 'profile.basic_v1';

const STEP_COPY: Record<string, { title: string; description: string }> = {
  [PROFILE_STEP_ID]: {
    title: 'Tell us about yourself',
    description: 'Add your first name, last name, and a contact email so agents know who you are.',
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type OnboardingContentProps = {
  status: OnboardingStatusResponse;
  onSubmitProfile: (values: ProfileFormValues) => Promise<void>;
  isSubmitting: boolean;
};

export function OnboardingContent({ status, onSubmitProfile, isSubmitting }: OnboardingContentProps) {
  const orderedSteps = useMemo(() => deriveOrderedSteps(status), [status]);
  const currentStepId = status.requiredSteps[0] ?? null;

  return (
    <div className="space-y-8">
      <WizardProgress status={status} orderedSteps={orderedSteps} />
      <div className="grid gap-8 lg:grid-cols-2">
        <StepList orderedSteps={orderedSteps} status={status} currentStepId={currentStepId} />
        <div className="rounded-2xl border border-[var(--agyn-border-light)] bg-white p-6 shadow-sm">
          {currentStepId === PROFILE_STEP_ID ? (
            <ProfileStepForm
              initialValues={status.data.profile ?? EMPTY_PROFILE}
              onSubmit={onSubmitProfile}
              isSubmitting={isSubmitting}
            />
          ) : (
            <UnknownStep stepId={currentStepId} />
          )}
        </div>
      </div>
    </div>
  );
}

function deriveOrderedSteps(status: OnboardingStatusResponse): string[] {
  const ordered: string[] = [];
  for (const id of status.completedSteps) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  for (const id of status.requiredSteps) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered.length > 0 ? ordered : [PROFILE_STEP_ID];
}

function WizardProgress({
  status,
  orderedSteps,
}: {
  status: OnboardingStatusResponse;
  orderedSteps: string[];
}) {
  const totalSteps = Math.max(orderedSteps.length, 1);
  const completed = Math.min(status.completedSteps.length, totalSteps);
  const currentNumber = Math.min(completed + 1, totalSteps);
  const progressPercent = (completed / totalSteps) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Step {currentNumber} of {totalSteps}
        </span>
        <span>{Math.round(progressPercent)}% complete</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--agyn-border-light)]">
        <div
          className="h-full bg-[var(--agyn-blue)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function StepList({
  orderedSteps,
  status,
  currentStepId,
}: {
  orderedSteps: string[];
  status: OnboardingStatusResponse;
  currentStepId: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Required steps</p>
      <ul className="space-y-3">
        {orderedSteps.map((stepId) => {
          const copy = STEP_COPY[stepId] ?? {
            title: stepId,
            description: 'Complete this step to continue.',
          };
          const isComplete = status.completedSteps.includes(stepId);
          const isActive = stepId === currentStepId;
          return (
            <li key={stepId} className="flex items-start gap-3">
              {isComplete ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
              ) : (
                <span
                  className={cx(
                    'mt-0.5 h-5 w-5 rounded-full border border-[var(--agyn-border-light)]',
                    isActive && 'border-[var(--agyn-blue)] bg-[rgba(67,97,238,0.08)]',
                  )}
                />
              )}
              <div>
                <p className="text-sm font-medium">{copy.title}</p>
                <p className="text-xs leading-snug text-muted-foreground">{copy.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProfileStepForm({
  initialValues,
  onSubmit,
  isSubmitting,
}: {
  initialValues: ProfileFormValues;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  isSubmitting: boolean;
}) {
  const {
    handleSubmit,
    register,
    formState: { errors },
    reset,
  } = useForm<ProfileFormValues>({
    defaultValues: initialValues ?? EMPTY_PROFILE,
  });

  useEffect(() => {
    reset(initialValues ?? EMPTY_PROFILE);
  }, [initialValues, reset]);

  const onSubmitForm = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form className="space-y-4" onSubmit={onSubmitForm}>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Profile basics</h3>
        <p className="text-sm text-muted-foreground">
          We use this information to personalize agent assignments and notifications.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="firstName" className="text-sm font-medium">
          First name
        </label>
        <Input
          id="firstName"
          autoComplete="given-name"
          placeholder="Jane"
          {...register('firstName', {
            required: 'First name is required',
            validate: (value) => value.trim().length > 0 || 'First name is required',
          })}
          aria-invalid={errors.firstName ? 'true' : undefined}
          aria-describedby={errors.firstName ? 'firstName-error' : undefined}
        />
        {errors.firstName && (
          <p id="firstName-error" role="alert" className="text-xs text-red-500">
            {errors.firstName.message}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="lastName" className="text-sm font-medium">
          Last name
        </label>
        <Input
          id="lastName"
          autoComplete="family-name"
          placeholder="Doe"
          {...register('lastName', {
            required: 'Last name is required',
            validate: (value) => value.trim().length > 0 || 'Last name is required',
          })}
          aria-invalid={errors.lastName ? 'true' : undefined}
          aria-describedby={errors.lastName ? 'lastName-error' : undefined}
        />
        {errors.lastName && (
          <p id="lastName-error" role="alert" className="text-xs text-red-500">
            {errors.lastName.message}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register('email', {
            required: 'Email is required',
            validate: (value) => /.+@.+\..+/.test(value.trim()) || 'Enter a valid email',
          })}
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-xs text-red-500">
            {errors.email.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and continue
      </Button>
    </form>
  );
}

function UnknownStep({ stepId }: { stepId: string | null }) {
  if (!stepId) {
    return <p className="text-sm text-muted-foreground">No additional steps are required right now.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="font-medium">{stepId}</p>
      <p className="text-sm text-muted-foreground">
        This onboarding step is not yet supported in the UI. Please check back after updating the application.
      </p>
    </div>
  );
}
