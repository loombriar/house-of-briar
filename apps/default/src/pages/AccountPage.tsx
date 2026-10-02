import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogIn, Pencil, Plus, Save, Trash2 } from '@/lib/icons';
import { createNode, deleteNode, getFieldNumber, getFieldValue, getNodes, getTitle, uploadFile, updateNode, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import StudioPhotoPicker, { releaseStudioPhotoPreviews, type StudioPhoto } from '@/components/StudioPhotoPicker';
import { getProductImages, MARKET_CATEGORIES, PRIVATE_DESIGNER_LISTINGS_PROJECT_ID } from '@/lib/marketplace';
import { createRefund } from '@/lib/stripe';
const DEFAULT_CATEGORY = MARKET_CATEGORIES[0];
const DEFAULT_SIZE = 'One size';
const DEFAULT_TAGS = 'New listing';

function StudioContent() {
  const auth = useAuth();
  const ownerId = auth.user?.profile.sub;
  const designerEmail = auth.user?.profile.email ?? '';
  const [products, setProducts] = useState<GenesisNode[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Draft');
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [photos, setPhotos] = useState<StudioPhoto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refundId, setRefundId] = useState('');
  const [refundMessage, setRefundMessage] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);

  const refreshProducts = async () => {
    if (!ownerId) return;
    try {
      const items = await getNodes(PRIVATE_DESIGNER_LISTINGS_PROJECT_ID);
      setProducts(items.filter((item) => getFieldValue(item, '@ownr1', 'Owner ID') === ownerId));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Your private listings could not be loaded.');
    }
  };

  useEffect(() => {
    void refreshProducts();
  }, [ownerId]);

  const resetListingForm = () => {
    releaseStudioPhotoPreviews(photos);
    setName('');
    setPrice('');
    setDescription('');
    setStatus('Draft');
    setCategory(DEFAULT_CATEGORY);
    setSize(DEFAULT_SIZE);
    setTags(DEFAULT_TAGS);
    setPhotos([]);
    setEditingId(null);
  };

  const beginEdit = (product: GenesisNode) => {
    releaseStudioPhotoPreviews(photos);
    setEditingId(product.id);
    setName(getTitle(product, 'Name') ?? '');
    setPrice(String(getFieldNumber(product, '@price1', 'Price') ?? ''));
    setDescription(getFieldValue(product, '@descr1', 'Description') ?? '');
    setStatus(getFieldValue(product, '@stat1', 'Status') ?? 'Draft');
    setCategory(getFieldValue(product, '@categ1', 'Category') ?? DEFAULT_CATEGORY);
    setSize(getFieldValue(product, '@size01', 'Size') ?? DEFAULT_SIZE);
    setTags(getFieldValue(product, '@tags01', 'Tags') ?? '');
    const imageUrls = getProductImages(getFieldValue(product, '@image1', 'Image URL'), getFieldValue(product, '@gally1', 'Gallery URLs'));
    setPhotos(imageUrls.map((url, index) => ({ key: `saved-${product.id}-${index}`, name: `Photo ${index + 1}`, url, previewUrl: url })));
    setMessage('Editing this private listing.');
  };

  if (!auth.isAuthenticated) {
    return <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center"><LogIn className="mx-auto text-primary" size={28} /><h1 className="mt-5 font-serif text-4xl">Your studio is yours to shape.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to manage your private listings. Each designer sees only records owned by their account.</p><button type="button" onClick={() => void auth.signinRedirect()} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">Sign in or create account</button></div>;
  }

  const saveListing = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!ownerId || !designerEmail) {
      setMessage('Your account identity is not ready yet. Sign in again and retry.');
      return;
    }
    if (!name.trim() || !price.trim()) {
      setMessage('Add a name and price before saving.');
      return;
    }
    setIsSaving(true);
    try {
      const imageUrls: string[] = [];
      for (const [index, photo] of photos.entries()) {
        if (photo.file) {
          setMessage(`Uploading photo ${index + 1} of ${photos.length}...`);
          imageUrls.push((await uploadFile(photo.file)).url);
        } else if (photo.url) {
          imageUrls.push(photo.url);
        }
      }
      const listingValues: Record<string, string | number> = {
        Name: name.trim(),
        Price: Number(price),
        Category: category,
        Size: size.trim() || DEFAULT_SIZE,
        Tags: tags.trim(),
        Description: description.trim() || 'A new piece made with intention.',
        Status: status,
      };
      if (imageUrls.length > 0) {
        listingValues['Image URL'] = imageUrls[0];
        listingValues['Gallery URLs'] = imageUrls.slice(1).join('\n');
      } else if (editingId) {
        listingValues['Image URL'] = '';
        listingValues['Gallery URLs'] = '';
      }
      if (editingId) {
        const result = await updateNode(PRIVATE_DESIGNER_LISTINGS_PROJECT_ID, editingId, listingValues);
        if (result.ignoredKeys?.length) {
          setMessage(`Some details could not be saved: ${result.ignoredKeys.join(', ')}`);
          return;
        }
        await refreshProducts();
        resetListingForm();
        setMessage('Your private listing was updated.');
        return;
      }
      const result = await createNode(PRIVATE_DESIGNER_LISTINGS_PROJECT_ID, {
        ...listingValues,
        'Owner ID': ownerId,
        'Designer Email': designerEmail,
        Designer: auth.user?.profile.name ?? designerEmail,
      });
      if (result.ignoredKeys?.length || !result.id) {
        setMessage(`Some details could not be saved: ${result.ignoredKeys?.join(', ') ?? 'the new listing could not be created'}`);
        return;
      }
      await refreshProducts();
      resetListingForm();
      setMessage('Your private listing is saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your listing could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeProduct = async (productId: string) => {
    try {
      await deleteNode(PRIVATE_DESIGNER_LISTINGS_PROJECT_ID, productId);
      setProducts((items) => items.filter((item) => item.id !== productId));
      if (editingId === productId) resetListingForm();
      setMessage('The private listing was removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That listing could not be removed.');
    }
  };

  const toggleStatus = async (product: GenesisNode) => {
    const next = getFieldValue(product, '@stat1', 'Status') === 'Available' ? 'Draft' : 'Available';
    try {
      await updateNode(PRIVATE_DESIGNER_LISTINGS_PROJECT_ID, product.id, { Status: next });
      setProducts((items) => items.map((item) => item.id === product.id ? { ...item, fieldValues: { ...item.fieldValues, Status: next, '@stat1': next } } : item));
      if (editingId === product.id) setStatus(next);
      setMessage(`Visibility saved as ${next}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That visibility change could not be saved.');
    }
  };

  const refund = async (event: FormEvent) => {
    event.preventDefault();
    setRefundLoading(true);
    setRefundMessage('');
    try {
      await createRefund(refundId);
      setRefundMessage('Refund created in Stripe.');
      setRefundId('');
    } catch (error) {
      setRefundMessage(error instanceof Error ? error.message : 'Stripe could not create the refund.');
    } finally {
      setRefundLoading(false);
    }
  };

  const isEditing = editingId !== null;
  return <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-5 border-b border-border pb-8 md:flex-row md:items-end"><div><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Home</Link><p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-primary">Private designer studio</p><h1 className="mt-3 font-serif text-5xl">Make your corner of the briar.</h1><p className="mt-3 text-sm text-muted-foreground">Signed in as {designerEmail}</p></div><button type="button" onClick={() => void auth.signoutRedirect()} className="min-h-11 rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:border-primary hover:text-primary">Sign out</button></div><div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">These records are private to your signed-in account. The public catalog remains shared and unchanged while you prepare your listings here.</div>{loadError && <p role="alert" className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{loadError}</p>}<div className="mt-10 grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={(event) => void saveListing(event)} data-genesis-form="designer-listing" className="rounded-3xl border border-border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-accent text-primary">{isEditing ? <Pencil size={18} /> : <Plus size={18} />}</span><div><h2 className="font-serif text-2xl">{isEditing ? 'Edit private listing' : 'Add a private listing'}</h2><p className="text-sm text-muted-foreground">{isEditing ? 'Update the details that appear on your listing.' : 'Start with the story. You can refine it later.'}</p></div></div><div className="mt-7 space-y-5"><label data-genesis-field="Name" className="block text-sm font-medium">Piece name<input autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label data-genesis-field="Price" className="block text-sm font-medium">Price<input type="number" inputMode="decimal" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label data-genesis-field="Category" className="block text-sm font-medium">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">{MARKET_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label data-genesis-field="Size" className="block text-sm font-medium">Size<input autoComplete="off" value={size} onChange={(event) => setSize(event.target.value)} placeholder="One size, Small, 8x10 in" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label data-genesis-field="Tags" className="block text-sm font-medium">Tags<input autoComplete="off" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="linen, botanical, hand-painted" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /><span className="mt-1 block text-xs text-muted-foreground">Separate tags with commas.</span></label><StudioPhotoPicker photos={photos} setPhotos={setPhotos} /><label data-genesis-field="Description" className="block text-sm font-medium">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label data-genesis-field="Status" className="block text-sm font-medium">Visibility<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"><option>Draft</option><option>Available</option><option>Sold</option></select></label></div>{message && <p className="mt-4 text-sm text-primary" role="status">{message}</p>}<div className="mt-6 flex flex-col gap-3 sm:flex-row"><button data-genesis-submit type="submit" disabled={isSaving} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"><Save size={17} /> {isSaving ? 'Uploading & saving…' : isEditing ? 'Save listing changes' : 'Save private listing'}</button>{isEditing && <button type="button" onClick={resetListingForm} className="min-h-12 rounded-full border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary">Cancel edit</button>}</div></form><section className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="font-serif text-2xl">Your private collection</h2><p className="mt-1 text-sm text-muted-foreground">Only your owned records appear here.</p></div><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">{products.length} pieces</span></div><div className="mt-6 divide-y divide-border">{products.map((product) => <div key={product.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-medium">{getTitle(product, 'Name') ?? 'Untitled piece'}</p><p className="mt-1 text-sm text-muted-foreground">{getFieldNumber(product, '@price1', 'Price') ?? 0} · {getFieldValue(product, '@stat1', 'Status') ?? 'Draft'} · {getFieldValue(product, '@categ1', 'Category') ?? DEFAULT_CATEGORY}</p><p className="mt-1 truncate text-xs text-muted-foreground">{getFieldValue(product, '@tags01', 'Tags') ?? 'No tags'}{getFieldValue(product, '@image1', 'Image URL') ? ' · Cover image added' : ''}{getFieldValue(product, '@gally1', 'Gallery URLs') ? ' · Gallery added' : ''}</p></div><div className="flex shrink-0 flex-wrap items-center gap-1"><button type="button" onClick={() => beginEdit(product)} className="min-h-11 rounded-full px-3 text-xs text-muted-foreground transition hover:bg-accent hover:text-primary"><Pencil size={14} className="mr-1 inline" /> Edit details</button><button type="button" onClick={() => void toggleStatus(product)} className="min-h-11 rounded-full px-3 text-xs text-muted-foreground transition hover:bg-accent hover:text-primary">Toggle visibility</button><button type="button" onClick={() => void removeProduct(product.id)} aria-label={`Remove ${getTitle(product, 'Name') ?? 'listing'}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 size={16} /></button></div></div>)}</div><div className="mt-6 rounded-2xl bg-accent/50 p-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Payout note:</strong> checkout and refunds use the connected Stripe account. Automatic designer payouts still require Stripe Connect onboarding and connected-account IDs.</div><form onSubmit={(event) => void refund(event)} className="mt-5 rounded-2xl border border-border p-4" data-genesis-form="refund"><h3 className="font-serif text-xl">Issue a refund</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Paste a Stripe payment intent or charge ID from the Stripe dashboard.</p><label data-genesis-field="refund-id" className="mt-4 block text-sm font-medium">Payment or charge ID<input autoComplete="off" value={refundId} onChange={(event) => setRefundId(event.target.value)} placeholder="pi_… or ch_…" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>{refundMessage && <p role="status" className="mt-3 text-sm text-primary">{refundMessage}</p>}<button data-genesis-submit type="submit" disabled={refundLoading || !refundId.trim()} className="mt-4 min-h-11 rounded-full border border-border px-4 text-sm font-medium transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{refundLoading ? 'Creating refund…' : 'Create refund'}</button></form></section></div></div>;
}

export default function AccountPage() {
  return <HouseShell><StudioContent /></HouseShell>;
}
