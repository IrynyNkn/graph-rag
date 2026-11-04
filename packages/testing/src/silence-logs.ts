import { Logger } from '@nestjs/common';

// Tests exercise failures on purpose, and their expected error logs would only hide real ones.
Logger.overrideLogger(false);
