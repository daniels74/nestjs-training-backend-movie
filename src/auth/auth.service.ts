import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { SignUpCredentialsDto } from './dto/signup.dto';
import { SignInCredentialsDto } from './dto/signin.dto';
import { UpdateCredentialDto } from './dto/update-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CheckEmailDto } from './dto/check-email.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /* SignUp @Post */
  async signUp(
    signupCredentialsDto: SignUpCredentialsDto,
  ): Promise<{ accessToken: string }> {
    const { username, password, email, tmdb_key, role } = signupCredentialsDto;

    // hash the password;
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    // create user;
    const user = this.userRepository.create({
      username,
      password: hashedPassword,
      email,
      tmdb_key,
      role: role ? UserRole[role] : UserRole.USER,
    });

    try {
      const accessToken: string = await this.createToken(user); // return Token;
      const thisuser = await this.userRepository.save(user); // post user to database;

      return { accessToken };
    } catch (error) {
      console.log(error);
      if (error.code === '11000') {
        // 23505 --> duplicate username // for postgresql
        // 11000 --> duplicate username // for mongodb
        throw new ConflictException('Username already exists');
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  /* SignIn @Post */
  async signIn(
    signinCredentialsDto: SignInCredentialsDto,
  ): Promise<{ accessToken: string }> {
    const { email, password } = signinCredentialsDto;
    const user = await this.userRepository.findOne({ where: { email } });

    console.log(user);

    if (user && (await bcrypt.compare(password, user.password))) {
      const accessToken: string = await this.createToken(user);
      return { accessToken };
    } else {
      throw new UnauthorizedException('Please check your login credentials');
    }
  }

  /* Refresh Token @Post */
  refreshToken(refreshTokenDto: RefreshTokenDto) {
    const accessToken: string = this.createToken(refreshTokenDto as User);
    return { accessToken };
  }

  async checkEmail({ email }: CheckEmailDto): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    return user ? true : false;
  }

  /* Update User Info @Patch */
  async updateUser(updateCredentialDto: UpdateCredentialDto, user: User) {
    const { role } = updateCredentialDto;
    const updatedUser = await this.userRepository.update(user.id, {
      ...updateCredentialDto,
      role: UserRole[role],
    });
    const accessToken: string = this.createToken(user);
    return { accessToken };
  }

  async getUser(user: User): Promise<User> {
    const existUser = await this.userRepository.findOne({
      where: { user },
    });
    if (!existUser)
      throw new NotFoundException(`User "${user.username}" not found!`);
    return user;
  }

  /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ create JWT ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
  private createToken(user: User) {
    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tmdb_key: user.tmdb_key,
    };

    const accessToken: string = this.jwtService.sign(payload);
    return accessToken;
  }
}

/* 
    create the jwt during signUp --> jwt hold the {email} now;
    
    when send request to server --> jwt strategy will validate the jwt, 

    the validate can get the payload in the jwt, in this case --> {email}
    base on the email, validate fn can find the user from the repository;
    then return ---> user

    the getUser decorator can get the user after it from the jwtstrategy --> req.user

    in the task request, it can get this user too!
*/
