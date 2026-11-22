import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EducationKind,
  ExperienceType,
  PortfolioVisibility,
  ProjectStatus,
  SkillLevel,
} from '../../../common/constants/domain';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(120) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(180) headline?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) professionalTitle?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) summary?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(8000) bio?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsEmail() publicEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(40) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) websiteUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) linkedinUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) githubUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) twitterUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) dribbbleUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) gitlabUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) stackoverflowUrl?: string | null;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  extraLinks?: { label: string; url: string }[] | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(180) metaTitle?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(320) metaDescription?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(9) accentColor?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) portfolioTemplate?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PortfolioVisibility) visibility?: PortfolioVisibility;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() indexable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showPhone?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showProjects?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showExperience?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showEducation?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showSkills?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showCvDownload?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contactEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) slug?: string;
}

export class SkillDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(1000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SkillLevel) level?: SkillLevel;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() featured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(60) yearsOfExperience?: number;
}

export class ProjectMetricDto {
  @IsString() @MaxLength(60) label!: string;
  @IsString() @MaxLength(40) value!: string;
}

export class ProjectDto {
  @IsString() @MaxLength(180) title!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(220) subtitle?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(6000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) problem?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) solution?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) outcome?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(25) @IsString({ each: true }) technologies?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) imageFileIds?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) demoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) repositoryUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) videoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(80) category?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHighlighted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ type: [ProjectMetricDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ProjectMetricDto)
  metrics?: ProjectMetricDto[] | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  skillIds?: string[];
}

export class ExperienceDto {
  @IsString() @MaxLength(180) role!: string;
  @IsString() @MaxLength(180) company!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) companyUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ExperienceType) type?: ExperienceType;
  @IsDateString() startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCurrent?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(5000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) achievements?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(25) @IsString({ each: true }) technologies?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  skillIds?: string[];
}

export class EducationDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(EducationKind) kind?: EducationKind;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) degree?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) title?: string | null;
  @IsString() @MaxLength(220) institution!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) fieldOfStudy?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCurrent?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) grade?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(3000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) credentialUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) credentialId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class LanguageDto {
  @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) proficiency?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class ReorderDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
}

export class UpdateAccountDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['fr', 'en']) locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['light', 'dark', 'system']) themePreference?: 'light' | 'dark' | 'system';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(170) timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarFileId?: string | null;
}
