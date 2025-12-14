import { Inject, Injectable } from '@nestjs/common';
import semver from 'semver';
import { UserProfileService } from '../user-profile/user-profile.service';
import { OnboardingStepsRegistry } from './onboarding.steps';
import type {
  OnboardingDataSnapshot,
  OnboardingStatusResponse,
  OnboardingStepContext,
} from './onboarding.types';

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(OnboardingStepsRegistry) private readonly stepsRegistry: OnboardingStepsRegistry,
    @Inject(UserProfileService) private readonly userProfileService: UserProfileService,
  ) {}

  async getStatus(appVersion: string): Promise<OnboardingStatusResponse> {
    const snapshot = await this.loadSnapshot();
    return this.computeStatus(appVersion, snapshot);
  }

  private async loadSnapshot(): Promise<OnboardingDataSnapshot> {
    const profile = await this.userProfileService.getProfile();
    return { profile };
  }

  private computeStatus(appVersion: string, snapshot: OnboardingDataSnapshot): OnboardingStatusResponse {
    const steps = this.stepsRegistry.list();
    const requiredSteps: string[] = [];
    const completedSteps: string[] = [];

    const context: OnboardingStepContext = {
      appVersion,
      data: snapshot,
      completedSteps: new Set<string>(),
    };

    for (const step of steps) {
      if (!semver.gte(appVersion, step.introducedIn)) continue;

      const fulfilled = step.isFulfilled(context);
      if (fulfilled) {
        context.completedSteps.add(step.stepId);
        completedSteps.push(step.stepId);
        continue;
      }

      if (step.isRequired(context)) {
        requiredSteps.push(step.stepId);
      }
    }

    return {
      isComplete: requiredSteps.length === 0,
      requiredSteps,
      completedSteps,
      data: snapshot,
    };
  }
}
