/**
 *
 * Required Modules
 *
 */

import {
  $query,
  $update,
  ic,
  nat64,
  int32,
  float32,
  match,
  Vec,
  Opt,
  Record,
  Result,
  StableBTreeMap,
} from 'azle';
import { v4 as uuid } from 'uuid';

/**
 *
 * Types (Interfaces)
 *
 */

type User = Record<{
  id: string;
  role: string;
  balance: float32;
  username: string;
  password: string;
  ticketsPurchased: int32;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type UserPayload = Record<{
  username: string;
  password: string;
  role: string;
}>;

type Event = Record<{
  id: string;
  name: string;
  desc: string;
  organizer: string;
  organizerId: string;
  ticketPrice: float32;
  ticketSold: int32;
  ticketsAvailable: int32;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type EventPayload = Record<{
  name: string;
  desc: string;
  password: string;
  organizerId: string;
  ticketPrice: float32;
  ticketsAvailable: int32;
}>;

type Ticket = Record<{
  id: string;
  price: float32;
  valid: boolean;
  holder: string;
  holderId: string;
  eventId: string;
  eventName: string;
  organizer: string;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type TicketPayload = Record<{
  eventId: string;
  holderId: string;
  password: string;
}>;

type TicketTopUpPayload = Record<{
  organizerId: string;
  password: string;
  eventId: string;
  amount: int32;
}>;

/**
 *
 * DataStores
 *
 */

const UserStore = new StableBTreeMap<string, User>(0, 44, 1024);
const EventStore = new StableBTreeMap<string, Event>(1, 44, 1024);
const TicketStore = new StableBTreeMap<string, Ticket>(2, 44, 1024);

/**
 *
 * Methods (User)
 *
 */

$update;
export function createUser(payload: UserPayload): Result<User, string> {
  const { role } = payload;

  if (payload.username.trim() === '') {
    return Result.Err<User, string>('username cannot be empty!');
  }

  if (payload.password.trim() === '') {
    return Result.Err<User, string>('password cannot be empty!');
  }

  if (role.toLowerCase() == 'attendee' || role.toLowerCase() == 'organizer') {
    const user: User = {
      id: uuid(),
      ...payload,
      password: payload.password.trim().toLowerCase(),
      createdAt: ic.time(),
      updatedAt: Opt.None,
      balance: 0.0,
      ticketsPurchased: 0,
    };
    UserStore.insert(user.id, user);
    return Result.Ok<User, string>(user);
  } else {
    return Result.Err<User, string>(
      'Invalid value for "role"! role can only be "attendee" or "organizer"'
    );
  }
}

$update;
export function topUpUserBalance(
  payload: Record<{
    amount: float32;
    userId: string;
    password: string;
  }>
): Result<User, string> {
  const { amount, userId, password } = payload;

  if (!amount) {
    return Result.Err<User, string>(
      `can't top up balance: amount cannot be undefined`
    );
  }

  return match(UserStore.get(userId), {
    Some: (user) => {
      if (user.password == password.toLowerCase().trim()) {
        const newBalance = user.balance + (amount < 0 ? amount * -1 : amount);

        const toppedUpUser: User = {
          ...user,
          updatedAt: Opt.Some(ic.time()),
          balance: newBalance,
        };

        UserStore.insert(user.id, toppedUpUser);
        return Result.Ok<User, string>(toppedUpUser);
      } else {
        return Result.Err<User, string>(
          `can't top up balance: user credential don't match`
        );
      }
    },
    None: () =>
      Result.Err<User, string>(
        `can't top up balance: no user found for userId=${userId}`
      ),
  });
}

/**
 *
 * Methods (Event)
 *
 */

$query;
export function getEvents(): Result<Vec<Event>, string> {
  const events = EventStore.values();
  return Result.Ok<Vec<Event>, string>(events);
}

$query;
export function getEvent(
  payload: Record<{ eventId: string }>
): Result<Event, string> {
  const { eventId } = payload;

  return match(EventStore.get(eventId), {
    Some: (event) => Result.Ok<Event, string>(event),
    None: () =>
      Result.Err<Event, string>(
        `Can't get event, event with eventId=${eventId} not found`
      ),
  });
}

$update;
export function createEvent(payload: EventPayload): Result<Event, string> {
  const { organizerId, password, ticketPrice, ticketsAvailable } = payload;
  return match(UserStore.get(organizerId), {
    Some: (user) => {
      if (user.password.toLowerCase() == password.toLowerCase()) {
        if (user.role !== 'organizer') {
          return Result.Err<Event, string>(
            `Can't create event: user lack sufficient privillages required!`
          );
        }
        const event: Event = {
          id: uuid(),
          organizer: user.username,
          createdAt: ic.time(),
          updatedAt: Opt.None,
          ticketSold: 0,
          ...payload,
          ticketPrice: ticketPrice < 0 ? ticketPrice * -1 : ticketPrice,
          ticketsAvailable:
            ticketsAvailable < 0 ? ticketsAvailable * -1 : ticketsAvailable,
        };
        EventStore.insert(event.id, event);
        return Result.Ok<Event, string>(event);
      } else {
        return Result.Err<Event, string>(
          `Can't create event: user credentials don't match`
        );
      }
    },
    None: () =>
      Result.Err<Event, string>(
        `Can't create event: no user found for organizerId=${organizerId}`
      ),
  });
}

$update;
export function deleteEvent(
  payload: Record<{ eventId: string; password: string; organizerId: string }>
): Result<Event, string> {
  const { eventId, organizerId, password } = payload;

  return match(UserStore.get(organizerId.trim()), {
    Some: (user) => {
      if (user.password === password.toLowerCase().trim()) {
        return match(EventStore.get(eventId.trim()), {
          Some: (event) => {
            if (event.organizerId === organizerId) {
              const tickets: Ticket[] = TicketStore.values();
              for (const ticket of tickets) {
                if (ticket.eventId === eventId.trim()) {
                  const voidTicket: Ticket = {
                    ...ticket,
                    updatedAt: Opt.Some(ic.time()),
                    valid: false,
                  };
                  TicketStore.insert(voidTicket.id, voidTicket);
                }
              }

              EventStore.remove(event.id);
              return Result.Ok<Event, string>(event);
            } else {
              return Result.Err<Event, string>(
                `can't delete event: you don't own this event!`
              );
            }
          },
          None: () =>
            Result.Err<Event, string>(
              `can't delete event: event with eventId=${eventId} not found`
            ),
        });
      } else {
        return Result.Err<Event, string>(
          `can't delete event: user credentials don't match!`
        );
      }
    },
    None: () =>
      Result.Err<Event, string>(
        `can't delete event: no user for organizerId=${organizerId}`
      ),
  });
}

$update;
export function topUpEventTickets(
  payload: TicketTopUpPayload
): Result<Event, string> {
  const { organizerId, password, eventId, amount } = payload;

  if (!amount) {
    return Result.Err<Event, string>(
      `can't top up tickets: amount cannot be undefined`
    );
  }

  const toppedAmount = amount < 0 ? amount * -1 : amount;

  return match(UserStore.get(organizerId), {
    Some: (user) => {
      if (user.password == password.toLowerCase()) {
        if (user.role === 'organizer') {
          return match(EventStore.get(eventId), {
            Some: (event) => {
              if (event.organizerId === organizerId) {
                const topedUpEvent: Event = {
                  ...event,
                  ticketsAvailable: event.ticketsAvailable + toppedAmount,
                  updatedAt: Opt.Some(ic.time()),
                };
                EventStore.insert(event.id, topedUpEvent);
                return Result.Ok<Event, string>(topedUpEvent);
              } else {
                return Result.Err<Event, string>(
                  `Can't top up tickets: you don not own this event!`
                );
              }
            },
            None: () =>
              Result.Err<Event, string>(
                `Can't top up tickets: no event found for eventId=${eventId}`
              ),
          });
        } else {
          return Result.Err<Event, string>(
            `Can't top up tickets: user lacks sufficient privillages required!`
          );
        }
      } else {
        return Result.Err<Event, string>(
          `Can't top up tickets: user credentials don't match`
        );
      }
    },
    None: () =>
      Result.Err<Event, string>(
        `Can't top up tickets: no user found for organizerId=${organizerId}`
      ),
  });
}

/**
 *
 * Methods (Tickets)
 *
 */

$update;
export function purchaseTicket(payload: TicketPayload): Result<Ticket, string> {
  const { eventId, holderId, password } = payload;

  return match(UserStore.get(holderId), {
    Some: (user) => {
      if (user.password == password.trim().toLowerCase()) {
        return match(EventStore.get(eventId), {
          Some: (event) => {
            if (user.balance > event.ticketPrice) {
              if (event.ticketsAvailable > 0) {
                const ticket: Ticket = {
                  id: uuid(),
                  ...payload,
                  valid: true,
                  eventName: event.name,
                  holder: user.username,
                  organizer: event.organizer,
                  price: event.ticketPrice,
                  createdAt: ic.time(),
                  updatedAt: Opt.None,
                };
                TicketStore.insert(ticket.id, ticket);

                const updatedUser: User = {
                  ...user,
                  updatedAt: Opt.Some(ic.time()),
                  ticketsPurchased: user.ticketsPurchased + 1,
                  balance: user.balance - ticket.price,
                };
                UserStore.insert(updatedUser.id, updatedUser);

                const newAvailableTickets =
                  event.ticketsAvailable - 1 < 0
                    ? 0
                    : event.ticketsAvailable - 1;
                const updatedEvent: Event = {
                  ...event,
                  updatedAt: Opt.Some(ic.time()),
                  ticketSold: event.ticketSold + 1,
                  ticketsAvailable: newAvailableTickets,
                };
                EventStore.insert(updatedEvent.id, updatedEvent);

                return Result.Ok<Ticket, string>(ticket);
              } else {
                return Result.Err<Ticket, string>(
                  `can't purchase ticket: tickets for this event are sold out!`
                );
              }
            } else {
              return Result.Err<Ticket, string>(
                `can't purchase ticket: user balance is low, need to top up!`
              );
            }
          },
          None: () =>
            Result.Err<Ticket, string>(
              `can't purchase ticket: event with eventId=${eventId} not found`
            ),
        });
      } else {
        return Result.Err<Ticket, string>(
          `can't purchase ticket: user credentials don't match`
        );
      }
    },
    None: () =>
      Result.Err<Ticket, string>(
        `can't purchase ticket: user with holderId=${holderId} not found`
      ),
  });
}

$query;
export function getTicketsOrganizer(
  payload: Record<{ organizerId: string; eventId: string; password: string }>
): Result<Vec<Ticket>, string> {
  const { organizerId, eventId, password } = payload;

  return match(UserStore.get(organizerId), {
    Some: (user) => {
      if (user.password === password.toLowerCase()) {
        return match(EventStore.get(eventId), {
          Some: (event) => {
            if (event.organizerId === organizerId) {
              const tickets: Ticket[] = TicketStore.values();
              const returnedTickets: Vec<Ticket> = [];

              for (const ticket of tickets) {
                if (ticket.eventId === eventId) {
                  returnedTickets.push(ticket);
                }
              }
              return Result.Ok<Vec<Ticket>, string>(returnedTickets);
            } else {
              return Result.Err<Vec<Ticket>, string>(
                `can't list tickets: you don't own this event!`
              );
            }
          },
          None: () =>
            Result.Err<Vec<Ticket>, string>(
              `can't list tickets: event with eventId=${eventId} not found`
            ),
        });
      } else {
        return Result.Err<Vec<Ticket>, string>(
          `can't list tickets: user credentials don't match!`
        );
      }
    },
    None: () =>
      Result.Err<Vec<Ticket>, string>(
        `can't list tickets: user not found for organizerId=${organizerId}`
      ),
  });
}

$query;
export function getTicketsAttendee(
  payload: Record<{ attendeeId: string; password: string }>
): Result<Vec<Ticket>, string> {
  const { attendeeId, password } = payload;

  return match(UserStore.get(attendeeId), {
    Some: (user) => {
      if (user.password === password.toLowerCase()) {
        const tickets: Ticket[] = TicketStore.values();
        const returnedTickets: Vec<Ticket> = [];

        for (const ticket of tickets) {
          if (ticket.holderId === attendeeId) {
            returnedTickets.push(ticket);
          }
        }
        return Result.Ok<Vec<Ticket>, string>(returnedTickets);
      } else {
        return Result.Err<Vec<Ticket>, string>(
          `can't list tickets: user credentials don't match!`
        );
      }
    },
    None: () =>
      Result.Err<Vec<Ticket>, string>(
        `can't list tickets: user not found for attendeeId=${attendeeId}`
      ),
  });
}

/**
 *
 * WorkArounds
 *
 */

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
