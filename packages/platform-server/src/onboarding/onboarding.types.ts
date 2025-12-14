import type { UserProfileData } from '../user-profile/user-profile.types';

export type OnboardingProfileData = UserProfileData;

export type OnboardingDataSnapshot = {
  profile: OnboardingProfileData | null;
};

export type OnboardingStatusResponse = {
  isComplete: boolean;
  requiredSteps: string[];
  completedSteps: string[];
  data: OnboardingDataSnapshot;
};

export type OnboardingStepContext = {
  appVersion: string;
  data: OnboardingDataSnapshot;
  completedSteps: Set<string>;
};

export type OnboardingStepDefinition = {
  stepId: string;
  introducedIn: string;
  isRequired(ctx: OnboardingStepContext): boolean;
  isFulfilled(ctx: OnboardingStepContext): boolean;
};
