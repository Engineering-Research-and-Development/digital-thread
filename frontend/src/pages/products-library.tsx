import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Package,
  Pencil,
  Trash2,
  Loader2,
  Search,
  X,
  Building2,
  Play,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProductStore } from '@/stores/product-store'
import { usePartnerStore } from '@/stores/partner-store'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/sonner'
import type { Product } from '@/types/state-machine'

export function ProductsLibrary() {
  const { products, loading, init, addProduct, updateProduct, removeProduct } = useProductStore()
  const { partners, init: initPartners } = usePartnerStore()
  const user = useAuthStore((s) => s.user)
  const role = user?.role
  const isSuperadmin = role === ROLE.SUPERADMIN
  const confirm = useConfirm()

  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [formUrn, setFormUrn] = useState('')
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formOwnerPartnerId, setFormOwnerPartnerId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (products.length === 0) init()
    if (Object.keys(partners).length === 0) initPartners()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const partnerList = useMemo(() => Object.values(partners).sort((a, b) => a.name.localeCompare(b.name)), [partners])

  const partnerNameFor = (p: Product): string => {
    if (p.ownerPartner?.name) return p.ownerPartner.name
    return partners[p.ownerPartnerId]?.name ?? '-'
  }

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.urn.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        partnerNameFor(p).toLowerCase().includes(q),
    )
  }, [products, searchQuery, partners]) // eslint-disable-line react-hooks/exhaustive-deps

  const openNewDialog = () => {
    setEditing(null)
    setFormUrn('')
    setFormName('')
    setFormDesc('')
    setFormOwnerPartnerId(isSuperadmin ? '' : (user?.partnerId ?? ''))
    setDialogOpen(true)
  }

  const openEditDialog = (product: Product) => {
    setEditing(product)
    setFormUrn(product.urn)
    setFormName(product.name)
    setFormDesc(product.description ?? '')
    setFormOwnerPartnerId(product.ownerPartnerId)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditing(null)
  }

  const handleSave = async () => {
    const urn = formUrn.trim()
    const name = formName.trim()
    if (!urn || !name) return
    if (isSuperadmin && !editing && !formOwnerPartnerId) {
      toast.error('Select an owning partner')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const body: { urn?: string; name?: string; description?: string | null; ownerPartnerId?: string } = {
          urn,
          name,
          description: formDesc.trim() || null,
        }
        // SUPERADMIN may reassign the owning partner; OWNER cannot.
        if (isSuperadmin && formOwnerPartnerId) body.ownerPartnerId = formOwnerPartnerId
        await updateProduct(editing.id, body)
        toast.success(`Product "${name}" updated`)
      } else {
        const body: { urn: string; name: string; description?: string; ownerPartnerId?: string } = {
          urn,
          name,
          description: formDesc.trim() || undefined,
        }
        // Only SUPERADMIN sends ownerPartnerId; OWNER's partner is inferred server-side.
        if (isSuperadmin && formOwnerPartnerId) body.ownerPartnerId = formOwnerPartnerId
        await addProduct(body)
        toast.success(`Product "${name}" created`)
      }
      closeDialog()
    } catch (e: any) {
      toast.error(`Failed to save product: ${e?.message ?? 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product: Product) => {
    const ok = await confirm({
      title: `Delete product "${product.name}"?`,
      description:
        (product.iterationCount ?? 0) > 0 ? (
          <>
            This product is linked to <strong>{product.iterationCount} iteration{product.iterationCount === 1 ? '' : 's'}</strong>.
            Deleting it cannot be undone.
          </>
        ) : (
          <>This product has no linked iterations. This action cannot be undone.</>
        ),
      confirmLabel: 'Delete product',
      destructive: true,
    })
    if (!ok) return
    try {
      await removeProduct(product.id)
      toast.success(`Product "${product.name}" deleted`)
    } catch (e: any) {
      toast.error(`Failed to delete product: ${e?.message ?? 'unknown error'}`)
    }
  }

  const ownPartnerName = user?.partner?.name ?? (user?.partnerId ? partners[user.partnerId]?.name : null) ?? '-'
  const hasFilter = searchQuery.length > 0

  return (
    <>
      <TopBar
        title="Products"
        subtitle="Registry of composite components tracked across the digital thread"
        actions={
          <Button size="sm" onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-1" />
            New Product
          </Button>
        }
      />
      <div className="p-6">
        {products.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Search products by name, URN, owner or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-9"
                aria-label="Search products"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredProducts.length} of {products.length}
            </span>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="border-border hover:border-blue-500/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate" title={product.name}>{product.name}</CardTitle>
                    <CardDescription className="text-[11px] mt-1 font-mono truncate" title={product.urn}>
                      {product.urn}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    <Play className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
                    {product.iterationCount ?? 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                {product.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{product.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 min-w-0" title="Owning partner">
                    <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{partnerNameFor(product)}</span>
                  </span>
                  <span className="flex items-center gap-1 tabular-nums whitespace-nowrap" title="Linked iterations">
                    <Play className="h-3 w-3" aria-hidden="true" />
                    {product.iterationCount ?? 0} iterations
                  </span>
                </div>
              </CardContent>
              <CardFooter className="gap-2 pt-0">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditDialog(product)}>
                  <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(product)}
                  aria-label={`Delete product ${product.name}`}
                  title="Delete product"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </CardFooter>
            </Card>
          ))}

          {!loading && products.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Package className="h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
              <p className="text-sm">No products registered yet</p>
              <p className="text-xs">Register a composite component to track it across iterations</p>
            </div>
          )}

          {!loading && products.length > 0 && filteredProducts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-8 w-8 mb-3 opacity-50" aria-hidden="true" />
              <p className="text-sm">No products match your search</p>
              {hasFilter && (
                <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
                  Clear search
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New / Edit Product Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the registry entry for this composite component.'
                : 'Register a composite component to track it across the digital thread.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave() }}
            className="space-y-4 py-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="product-urn" className="text-xs">
                URN <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only">required</span>
              </Label>
              <Input
                id="product-urn"
                placeholder="urn:digital-thread:product:wing-panel-42"
                value={formUrn}
                onChange={(e) => setFormUrn(e.target.value)}
                aria-required="true"
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground">Unique component reference</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-name" className="text-xs">
                Name <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only">required</span>
              </Label>
              <Input
                id="product-name"
                placeholder="e.g., Wing Panel 42"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                aria-required="true"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-desc" className="text-xs">Description</Label>
              <Textarea
                id="product-desc"
                placeholder="Describe the component, its role, dimensions..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <div className="flex justify-end">
                <span className="text-[10px] text-muted-foreground tabular-nums">{formDesc.length}/500</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owning partner</Label>
              {isSuperadmin ? (
                <Select value={formOwnerPartnerId} onValueChange={setFormOwnerPartnerId}>
                  <SelectTrigger id="product-owner">
                    <SelectValue placeholder="Select owning partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={ownPartnerName} readOnly disabled className="text-muted-foreground" />
              )}
              {!isSuperadmin && (
                <span className="text-[10px] text-muted-foreground">Products you register are owned by your partner</span>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={!formUrn.trim() || !formName.trim() || saving}>
                {saving ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Saving...</>
                ) : editing ? 'Save changes' : 'Create product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
