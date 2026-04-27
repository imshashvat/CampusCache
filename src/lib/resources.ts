import { supabase } from "@/integrations/supabase/client";

type WithUploader = {
  uploaded_by: string | null;
};

type UploaderProfile = {
  full_name: string | null;
};

export type ResourceWithProfile<T extends WithUploader> = T & {
  profiles: UploaderProfile | null;
};

export async function attachUploaderProfiles<T extends WithUploader>(
  resources: T[],
): Promise<ResourceWithProfile<T>[]> {
  if (resources.length === 0) {
    return [];
  }

  const uploaderIds = Array.from(
    new Set(resources.map((resource) => resource.uploaded_by).filter((id): id is string => Boolean(id))),
  );

  if (uploaderIds.length === 0) {
    return resources.map((resource) => ({ ...resource, profiles: null }));
  }

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", uploaderIds);

  if (error || !data) {
    return resources.map((resource) => ({ ...resource, profiles: null }));
  }

  const profilesById = new Map(
    data.map((profile) => [profile.id, { full_name: profile.full_name } satisfies UploaderProfile]),
  );

  return resources.map((resource) => ({
    ...resource,
    profiles: resource.uploaded_by ? profilesById.get(resource.uploaded_by) ?? null : null,
  }));
}