import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import semver from 'semver';
import { OnboardingService } from './onboarding.service';

class OnboardingStatusQueryDto {
  @IsString()
  @IsNotEmpty()
  appVersion!: string;
}

@Controller('api/onboarding')
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboardingService: OnboardingService) {}

  @Get('status')
  async getStatus(@Query() query: OnboardingStatusQueryDto) {
    const normalized = normalizeAppVersion(query.appVersion);
    if (!normalized) {
      throw new BadRequestException({ error: 'invalid_app_version' });
    }
    return this.onboardingService.getStatus(normalized);
  }
}

function normalizeAppVersion(raw: string): string | null {
  if (!raw) return null;
  const direct = semver.valid(raw);
  if (direct) return direct;
  const coerced = semver.coerce(raw);
  return coerced ? coerced.version : null;
}
