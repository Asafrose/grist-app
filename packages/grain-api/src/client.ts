import { GrainHttp, type GrainHttpOptions } from "./http";
import { HooksApi } from "./resources/hooks";
import { RecordingsApi } from "./resources/recordings";
import { MeetingTypesApi, TeamsApi, UploadsApi, UsersApi } from "./resources/workspace";

export const GRAIN_TOKEN_SETTINGS_URL =
  "https://grain.com/app/settings/account/integrations/personal_api";

export type GrainClientOptions = GrainHttpOptions;

export class GrainClient {
  readonly http: GrainHttp;
  readonly recordings: RecordingsApi;
  readonly hooks: HooksApi;
  readonly users: UsersApi;
  readonly teams: TeamsApi;
  readonly meetingTypes: MeetingTypesApi;
  readonly uploads: UploadsApi;

  constructor(opts: GrainClientOptions) {
    this.http = new GrainHttp(opts);
    this.recordings = new RecordingsApi(this.http);
    this.hooks = new HooksApi(this.http);
    this.users = new UsersApi(this.http);
    this.teams = new TeamsApi(this.http);
    this.meetingTypes = new MeetingTypesApi(this.http);
    this.uploads = new UploadsApi(this.http);
  }
}
