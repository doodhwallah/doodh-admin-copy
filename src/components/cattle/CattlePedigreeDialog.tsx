import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { GitBranch, User, Users, Baby, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, devError } from "@/lib/utils";

interface CattleBasic {
  id: string;
  tag_number: string;
  name: string | null;
  breed: string;
  cattle_type: string;
  status: string;
  lactation_status: string;
  date_of_birth: string | null;
  sire_id: string | null;
  dam_id: string | null;
}

interface PedigreeNode extends CattleBasic {
  sire?: PedigreeNode | null;
  dam?: PedigreeNode | null;
  offspring?: CattleBasic[];
}

interface CattlePedigreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cattleId: string;
  cattleName: string;
}

export function CattlePedigreeDialog({
  open,
  onOpenChange,
  cattleId,
  cattleName,
}: CattlePedigreeDialogProps) {
  const [loading, setLoading] = useState(true);
  const [pedigree, setPedigree] = useState<PedigreeNode | null>(null);
  const [showOffspring, setShowOffspring] = useState(false);

  useEffect(() => {
    if (open && cattleId) {
      fetchPedigree();
    }
  }, [open, cattleId]);

  const fetchPedigree = async () => {
    setLoading(true);
    try {
      // Fetch all cattle to build relationships
      const { data: allCattle, error } = await supabase
        .from("cattle")
        .select("id, tag_number, name, breed, cattle_type, status, lactation_status, date_of_birth, sire_id, dam_id");

      if (error) throw error;

      const cattleMap = new Map<string, CattleBasic>();
      allCattle?.forEach(c => cattleMap.set(c.id, c));

      const target = cattleMap.get(cattleId);
      if (!target) {
        setPedigree(null);
        return;
      }

      // Build pedigree tree (2 generations up)
      const buildAncestors = (cattle: CattleBasic, depth: number): PedigreeNode => {
        const node: PedigreeNode = { ...cattle };
        
        if (depth > 0) {
          if (cattle.sire_id) {
            const sire = cattleMap.get(cattle.sire_id);
            if (sire) node.sire = buildAncestors(sire, depth - 1);
          }
          if (cattle.dam_id) {
            const dam = cattleMap.get(cattle.dam_id);
            if (dam) node.dam = buildAncestors(dam, depth - 1);
          }
        }
        
        return node;
      };

      // Find offspring
      const offspring = allCattle?.filter(
        c => c.sire_id === cattleId || c.dam_id === cattleId
      ) || [];

      const pedigreeTree = buildAncestors(target, 2);
      pedigreeTree.offspring = offspring;

      setPedigree(pedigreeTree);
    } catch (error) {
      devError("Error fetching pedigree:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatAge = (dob: string | null) => {
    if (!dob) return null;
    const birth = new Date(dob);
    const now = new Date();
    const years = Math.floor((now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const months = Math.floor(((now.getTime() - birth.getTime()) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    if (years > 0) return `${years}y ${months}m`;
    return `${months}m`;
  };

  const CattleCard = ({ cattle, role, size = "normal" }: { 
    cattle: CattleBasic | null | undefined; 
    role: string;
    size?: "small" | "normal";
  }) => {
    if (!cattle) {
      return (
        <Card className={cn(
          "border-dashed border-muted-foreground/30",
          size === "small" ? "p-2" : "p-3"
        )}>
          <CardContent className="p-0 text-center">
            <p className="text-xs text-muted-foreground">{role}</p>
            <p className="text-sm text-muted-foreground/50">Unknown</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn(
        "transition-all hover:shadow-md",
        size === "small" ? "p-2" : "p-3",
        cattle.status === "active" ? "border-success/30 bg-success/5" : "border-muted"
      )}>
        <CardContent className="p-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground mb-0.5">{role}</p>
              <p className={cn(
                "font-semibold text-primary truncate",
                size === "small" ? "text-xs" : "text-sm"
              )}>
                {cattle.tag_number}
              </p>
              {cattle.name && (
                <p className={cn(
                  "text-muted-foreground truncate",
                  size === "small" ? "text-[10px]" : "text-xs"
                )}>
                  {cattle.name}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {cattle.breed}
              </Badge>
              {cattle.date_of_birth && (
                <span className="text-[10px] text-muted-foreground">
                  {formatAge(cattle.date_of_birth)}
                </span>
              )}
            </div>
          </div>
          {size === "normal" && (
            <div className="flex gap-1 mt-2">
              <StatusBadge status={cattle.status} />
              <StatusBadge status={cattle.lactation_status} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const GrandparentPair = ({ sire, dam }: { sire?: PedigreeNode | null; dam?: PedigreeNode | null }) => (
    <div className="flex gap-2">
      <div className="flex-1">
        <CattleCard cattle={sire} role="Grandsire" size="small" />
      </div>
      <div className="flex-1">
        <CattleCard cattle={dam} role="Granddam" size="small" />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Pedigree - {cattleName}
          </DialogTitle>
          <DialogDescription>
            View family lineage and offspring information
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="flex gap-4">
              <Skeleton className="h-20 flex-1" />
              <Skeleton className="h-20 flex-1" />
            </div>
          </div>
        ) : pedigree ? (
          <div className="space-y-6">
            {/* Grandparents Row */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Users className="h-3 w-3" />
                  <span>Paternal Grandparents</span>
                </div>
                <GrandparentPair 
                  sire={pedigree.sire?.sire} 
                  dam={pedigree.sire?.dam} 
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Users className="h-3 w-3" />
                  <span>Maternal Grandparents</span>
                </div>
                <GrandparentPair 
                  sire={pedigree.dam?.sire} 
                  dam={pedigree.dam?.dam} 
                />
              </div>
            </div>

            {/* Connecting lines visual */}
            <div className="flex justify-center">
              <div className="w-px h-4 bg-border" />
            </div>

            {/* Parents Row */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <User className="h-3 w-3" />
                  <span>Sire (Father)</span>
                </div>
                <CattleCard cattle={pedigree.sire} role="Sire" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <User className="h-3 w-3" />
                  <span>Dam (Mother)</span>
                </div>
                <CattleCard cattle={pedigree.dam} role="Dam" />
              </div>
            </div>

            {/* Connecting lines visual */}
            <div className="flex justify-center">
              <div className="flex items-center gap-2">
                <div className="w-24 h-px bg-border" />
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                <div className="w-24 h-px bg-border" />
              </div>
            </div>

            {/* Subject Animal */}
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                <Card className="border-2 border-primary bg-primary/5 p-4">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-primary font-medium mb-1">Selected Animal</p>
                        <p className="text-lg font-bold text-primary">{pedigree.tag_number}</p>
                        {pedigree.name && (
                          <p className="text-sm text-muted-foreground">{pedigree.name}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">{pedigree.breed}</Badge>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">
                          {pedigree.cattle_type}
                        </p>
                        {pedigree.date_of_birth && (
                          <p className="text-xs text-muted-foreground">
                            Age: {formatAge(pedigree.date_of_birth)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <StatusBadge status={pedigree.status} />
                      <StatusBadge status={pedigree.lactation_status} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Offspring Section */}
            {pedigree.offspring && pedigree.offspring.length > 0 && (
              <>
                <div className="flex justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-px bg-border" />
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    <div className="w-24 h-px bg-border" />
                  </div>
                </div>

                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOffspring(!showOffspring)}
                    className="w-full justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Baby className="h-4 w-4" />
                      <span>Offspring ({pedigree.offspring.length})</span>
                    </div>
                    {showOffspring ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>

                  {showOffspring && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
                      {pedigree.offspring.map((child) => (
                        <CattleCard 
                          key={child.id} 
                          cattle={child} 
                          role={child.sire_id === cattleId ? "Offspring (as Sire)" : "Offspring (as Dam)"} 
                          size="small"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* No offspring message */}
            {(!pedigree.offspring || pedigree.offspring.length === 0) && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No recorded offspring
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Unable to load pedigree information
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
