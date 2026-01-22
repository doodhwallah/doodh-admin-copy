import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { 
  Droplets, 
  Truck, 
  Receipt, 
  Beef, 
  Users,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

const quickActions = [
  {
    title: "Record Milk",
    icon: Droplets,
    href: "/production?action=add",
    color: "text-info",
    bgColor: "bg-info/10 hover:bg-info/20",
  },
  {
    title: "New Delivery",
    icon: Truck,
    href: "/deliveries?action=add",
    color: "text-warning",
    bgColor: "bg-warning/10 hover:bg-warning/20",
  },
  {
    title: "Create Invoice",
    icon: Receipt,
    href: "/billing?action=add",
    color: "text-success",
    bgColor: "bg-success/10 hover:bg-success/20",
  },
  {
    title: "Add Cattle",
    icon: Beef,
    href: "/cattle?action=add",
    color: "text-primary",
    bgColor: "bg-primary/10 hover:bg-primary/20",
  },
  {
    title: "New Customer",
    icon: Users,
    href: "/customers?action=add",
    color: "text-accent",
    bgColor: "bg-accent/10 hover:bg-accent/20",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
  },
};

export function QuickActionsCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Zap className="h-5 w-5 text-warning" />
            </motion.div>
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <motion.div 
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {quickActions.map((action) => (
              <motion.div key={action.title} variants={itemVariants}>
                <Link to={action.href}>
                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      variant="ghost"
                      className={cn(
                        "h-auto w-full flex-col gap-2 p-4 transition-colors duration-200",
                        action.bgColor
                      )}
                    >
                      <action.icon className={cn("h-6 w-6", action.color)} />
                      <span className="text-xs font-medium text-foreground">{action.title}</span>
                    </Button>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
