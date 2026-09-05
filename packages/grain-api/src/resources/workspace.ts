import type { GrainHttp } from "../http";
import { MeetingTypesResponse, TeamsResponse, UploadTicket, UsersResponse } from "../schemas";

export class UsersApi {
  constructor(private readonly http: GrainHttp) {}
  list() {
    return this.http.post("/users", UsersResponse);
  }
}

export class TeamsApi {
  constructor(private readonly http: GrainHttp) {}
  list() {
    return this.http.post("/teams", TeamsResponse);
  }
}

export class MeetingTypesApi {
  constructor(private readonly http: GrainHttp) {}
  list() {
    return this.http.post("/meeting_types", MeetingTypesResponse);
  }
}

export class UploadsApi {
  constructor(private readonly http: GrainHttp) {}
  create(filename: string, userId?: string) {
    return this.http.post("/recordings/upload", UploadTicket, { filename, user_id: userId });
  }
}
