import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  await dbConnect();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.tier = "pro";
          user.stripeSubscriptionId = subscriptionId;
          await user.save();
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subscriptionId =
          invoice.parent?.subscription_details?.subscription;

        if (subscriptionId) {
          const user = await User.findOne({ stripeCustomerId: customerId });
          if (user) {
            user.tier = "pro";
            user.stripeSubscriptionId = typeof subscriptionId === "string"
              ? subscriptionId
              : subscriptionId.id;
            await user.save();
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.tier = subscription.status === "active" ? "pro" : "free";
          user.stripeSubscriptionId = subscription.id;
          await user.save();
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.tier = "free";
          user.stripeSubscriptionId = undefined;
          user.stripePriceId = undefined;
          user.stripeCurrentPeriodEnd = undefined;
          await user.save();
        }
        break;
      }
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
