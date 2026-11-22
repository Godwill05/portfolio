import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(lower)
  @IsEmail({}, { message: 'Adresse email invalide' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le prénom est requis' })
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le nom est requis' })
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'MotDePasse123', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  @MaxLength(128)
  @Matches(PASSWORD_POLICY, {
    message: 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre',
  })
  password!: string;

  @ApiPropertyOptional({ enum: ['fr', 'en'] })
  @IsOptional()
  @IsIn(['fr', 'en'])
  locale?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(lower)
  @IsEmail({}, { message: 'Adresse email invalide' })
  email!: string;

  @ApiProperty({ example: 'MotDePasse123' })
  @IsString()
  @IsNotEmpty({ message: 'Mot de passe requis' })
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Requis uniquement si le cookie httpOnly est absent.' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: 'Adresse email invalide' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  @MaxLength(128)
  @Matches(PASSWORD_POLICY, {
    message: 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre',
  })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(PASSWORD_POLICY, {
    message: 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre',
  })
  newPassword!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class DeleteAccountDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ description: 'Doit valoir "SUPPRIMER" pour confirmer.' })
  @IsString()
  @IsIn(['SUPPRIMER'], { message: 'Tapez SUPPRIMER pour confirmer la suppression' })
  confirmation!: string;
}
