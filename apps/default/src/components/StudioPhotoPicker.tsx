import { useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { ImagePlus } from '@/lib/icons';

export type StudioPhoto = {
  key: string;
  name: string;
  url?: string;
  file?: File;
  previewUrl: string;
};

const MAX_STUDIO_IMAGES = 10;
const ACCEPTED_IMAGE_NAME = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;

export function releaseStudioPhotoPreviews(photos: StudioPhoto[]) {
  photos.forEach((photo) => {
    if (photo.file && photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
  });
}

type StudioPhotoPickerProps = {
  photos: StudioPhoto[];
  setPhotos: Dispatch<SetStateAction<StudioPhoto[]>>;
};

export default function StudioPhotoPicker({ photos, setPhotos }: StudioPhotoPickerProps) {
  const [error, setError] = useState('');

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    const slots = MAX_STUDIO_IMAGES - photos.length;
    const accepted = files.slice(0, Math.max(0, slots));
    const additions: StudioPhoto[] = [];
    const issues: string[] = [];

    if (files.length > slots) issues.push(`Only ${Math.max(0, slots)} more photo${slots === 1 ? '' : 's'} can be added.`);
    accepted.forEach((file, index) => {
      if ((file.type && !file.type.startsWith('image/')) || (!file.type && !ACCEPTED_IMAGE_NAME.test(file.name))) {
        issues.push(`${file.name} is not a supported image.`);
        return;
      }
      additions.push({
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });

    if (additions.length) setPhotos((current) => [...current, ...additions]);
    setError(issues.join(' '));
  };

  const movePhoto = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    setPhotos((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removePhoto = (index: number) => {
    const photo = photos[index];
    if (photo) releaseStudioPhotoPreviews([photo]);
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  };

  return (
    <section aria-labelledby="studio-photos-heading" className="space-y-3">
      <div>
        <h3 id="studio-photos-heading" className="text-sm font-medium">Listing photos</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Add up to 10 photos. The first is the cover; reorder or remove photos before saving.</p>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 text-sm font-medium transition hover:border-primary hover:text-primary focus-within:ring-2 focus-within:ring-primary/30">
        <ImagePlus size={17} /> Choose photos
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
          multiple
          onChange={addPhotos}
          className="sr-only"
          aria-label="Choose up to ten listing photos"
        />
      </label>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {photos.length > 0 && (
        <ol className="space-y-2">
          {photos.map((photo, index) => {
            const isHeic = /\.(heic|heif)$/i.test(photo.name) || photo.file?.type === 'image/heic' || photo.file?.type === 'image/heif';
            return (
              <li key={photo.key} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-2">
                {isHeic ? (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><ImagePlus size={20} /></span>
                ) : (
                  <img src={photo.previewUrl} alt={index === 0 ? 'Listing cover preview' : `Listing photo ${index + 1} preview`} className="size-16 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{photo.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{index === 0 ? 'Cover photo' : `Photo ${index + 1}`}{photo.file ? ' · Ready to upload' : ' · Saved photo'}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <button type="button" onClick={() => movePhoto(index, -1)} disabled={index === 0} aria-label={`Move ${photo.name} up`} className="min-h-11 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-primary disabled:opacity-40">Move up</button>
                  <button type="button" onClick={() => movePhoto(index, 1)} disabled={index === photos.length - 1} aria-label={`Move ${photo.name} down`} className="min-h-11 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-primary disabled:opacity-40">Move down</button>
                  <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove ${photo.name}`} className="min-h-11 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">Remove</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
