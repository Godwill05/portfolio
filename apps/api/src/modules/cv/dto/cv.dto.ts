import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CvSectionType, CvStatus } from '../../../common/constants/domain';

export class CvSectionItemDto {
  @IsString() @MaxLength(80) id!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(200) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(200) meta?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsString() @MaxLength(40) startDate?: string;
  @IsOptional() @IsString() @MaxLength(40) endDate?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) bullets?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(5) level?: number;
  @IsOptional() @IsString() @MaxLength(400) url?: string;
}

export class CvSectionDto {
  @IsString() @MaxLength(80) id!: string;
  @IsEnum(CvSectionType) type!: CvSectionType;
  @IsString() @MaxLength(120) title!: string;
  @IsBoolean() visible!: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CvSectionItemDto)
  items!: CvSectionItemDto[];
  @IsOptional() @IsString() @MaxLength(6000) body?: string;
}

export class CvHeaderDto {
  @IsString() @MaxLength(160) fullName!: string;
  @IsOptional() @IsString() @MaxLength(200) headline?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;
  @IsOptional() @IsString() @MaxLength(300) linkedin?: string;
  @IsOptional() @IsString() @MaxLength(300) github?: string;
  @IsOptional() @IsString() photoFileId?: string | null;
  @IsOptional() @IsArray() extraLinks?: { label: string; url: string }[];
}

export class CvDocumentDto {
  @ValidateNested() @Type(() => CvHeaderDto) header!: CvHeaderDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CvSectionDto) sections!: CvSectionDto[];
  @IsOptional() @IsString() @MaxLength(400) footerNote?: string;
}

export class CvStyleDto {
  @IsOptional() @IsString() @MaxLength(9) accentColor?: string;
  @IsOptional() @IsString() @MaxLength(60) fontFamily?: string;
  @IsOptional() @IsInt() @Min(80) @Max(130) fontScale?: number;
  @IsOptional() @IsIn(['none', 'upper']) headingCase?: 'none' | 'upper';
  @IsOptional() @IsBoolean() showPhoto?: boolean;
  @IsOptional() @IsArray() @IsEnum(CvSectionType, { each: true }) sectionOrder?: CvSectionType[];
  @IsOptional() @IsIn(['compact', 'normal', 'relaxed']) density?: 'compact' | 'normal' | 'relaxed';
}

export class CreateCvDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) templateKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) targetRole?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() @ValidateNested() @Type(() => CvDocumentDto)
  document?: CvDocumentDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => CvStyleDto) style?: CvStyleDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiAssisted?: boolean;
}

export class UpdateCvDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) templateKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) targetRole?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEnum(CvStatus) status?: CvStatus;
  @ApiPropertyOptional() @IsOptional() @IsObject() @ValidateNested() @Type(() => CvDocumentDto)
  document?: CvDocumentDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => CvStyleDto) style?: CvStyleDto;
}

export class CvListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsEnum(CvStatus) status?: CvStatus;
}
