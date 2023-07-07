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
  Principal,
} from 'azle';
import { v4 as uuid } from 'uuid';

/**
 *
 * Types (Interfaces)
 *
 */

type User = Record<{
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
  eventId: string;
  amount: int32;
}>;


//Using the Principal ID on the internet computer to login and authenticate is the same way as 
//how users authenticate with their wallet addresses on other blockchains like ethereum. 
//It preffered as it provides a more secure and seamless way to login where the user does not have to worry about the password and username of every site you create an account on.
// all you have to worry about is the password to their wallet address. 
//from there, thy are able to create accounts on any platform using their wallet address


/**
 *
 * DataStores
 *
 */


const UserStore = new StableBTreeMap<Principal, User>(0, 44, 1024);
const EventStore = new StableBTreeMap<string, Event>(1, 44, 1024);
const TicketStore = new StableBTreeMap<string, Ticket>(2, 44, 1024);


/**
 *
 * Methods (User)
 *
 */



//create an account. the user cannot use the anonymous Principal ID
$update;
export function createUser(payload: UserPayload): Result<User, string> {
  const caller = ic.caller();
  const { role } = payload;

  if (payload.username.trim() === '') {
    return Result.Err<User, string>('username cannot be empty!');
  }

  if (payload.password.trim() === '') {
    return Result.Err<User, string>('password cannot be empty!');
  }

  if(caller.toString() === "2vxsx-fae"){
    return Result.Err<User,string>("Anonymous users cannot create accounts.")
  }

  if (role.toLowerCase() == 'attendee' || role.toLowerCase() == 'organizer') {
    const user: User = {
      ...payload,
      password: payload.password.trim().toLowerCase(),
      createdAt: ic.time(),
      updatedAt: Opt.None,
      balance: 0.0,
      ticketsPurchased: 0,
    };
    UserStore.insert(caller, user);
    return Result.Ok<User, string>(user);
  } else {
    return Result.Err<User, string>(
      'Invalid value for "role"! role can only be "attendee" or "organizer"'
    );
  }
}


//update the user balance
$update;
export function topUpUserBalance(
    amount: float32

): Result<User, string> {
  const caller = ic.caller();

  if (!amount) {
    return Result.Err<User, string>(
      `can't top up balance: amount cannot be undefined`
    );
  }

  return match(UserStore.get(caller), {
    Some: (user) => {

        const newBalance = user.balance + (amount < 0 ? amount * -1 : amount);

        const toppedUpUser: User = {
          ...user,
          updatedAt: Opt.Some(ic.time()),
          balance: newBalance,
        };

        UserStore.insert(caller, toppedUpUser);
        return Result.Ok<User, string>(toppedUpUser);
    },
    None: () =>
      Result.Err<User, string>(
        `can't top up balance: no user found for userId=${caller.toString()}`
      ),
  });
}


//get all events created
$query;
export function getEvents(): Result<Vec<Event>, string> {
  const events = EventStore.values();
  return Result.Ok<Vec<Event>, string>(events);
}


//get a specific event
$query;
export function getEvent(
   eventId: string 
): Result<Event, string> {
  return match(EventStore.get(eventId), {
    Some: (event) => Result.Ok<Event, string>(event),
    None: () =>
      Result.Err<Event, string>(
        `Can't get event, event with eventId=${eventId} not found`
      ),
  });
}


//create event by the user with enough priviledges
$update;
export function createEvent(payload: EventPayload): Result<Event, string> {
  const caller = ic.caller();
  const {ticketPrice, ticketsAvailable } = payload;
  return match(UserStore.get(caller), {
    Some: (user) => {
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
          organizerId: caller.toString(),
          ticketPrice: ticketPrice < 0 ? ticketPrice * -1 : ticketPrice,
          ticketsAvailable:
            ticketsAvailable < 0 ? ticketsAvailable * -1 : ticketsAvailable,
        };
        EventStore.insert(event.id, event);
        return Result.Ok<Event, string>(event);
      
    },
    None: () =>
      Result.Err<Event, string>(
        `Can't create event: no user found for organizerId=${caller.toString()}`
      ),
  });
}


//delete event by its creator
$update;
export function deleteEvent(
  eventId: string
): Result<Event, string> {
  const caller = ic.caller()
 

  return match(UserStore.get(caller), {
    Some: (user) => {

        return match(EventStore.get(eventId.trim()), {
          Some: (event) => {
            if (event.organizerId === caller.toString()) {
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
    },
    None: () =>
      Result.Err<Event, string>(
        `can't delete event: no user for organizerId=${caller.toString()}`
      ),
  });
}




//topup event tickets by the event organizer
$update;
export function topUpEventTickets(
  payload: TicketTopUpPayload
): Result<Event, string> {
  const {eventId, amount } = payload;
  const caller = ic.caller()

  if (!amount) {
    return Result.Err<Event, string>(
      `can't top up tickets: amount cannot be undefined`
    );
  }

  const toppedAmount = amount < 0 ? amount * -1 : amount;

  return match(UserStore.get(caller), {
    Some: (user) => {
        if (user.role === 'organizer') {
          return match(EventStore.get(eventId), {
            Some: (event) => {
              if (event.organizerId === caller.toString()) {
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
    },
    None: () =>
      Result.Err<Event, string>(
        `Can't top up tickets: no user found for organizerId=${caller.toString()}`
      ),
  });
}

/**
 *
 * Methods (Tickets)
 *
 */


//purchase ticket for the event
$update;
export function purchaseTicket(eventId: string): Result<Ticket, string> {
  const caller = ic.caller()


  return match(UserStore.get(caller), {
    Some: (user) => {

        return match(EventStore.get(eventId), {
          Some: (event) => {
            if (user.balance > event.ticketPrice) {
              if (event.ticketsAvailable > 0) {
                const ticket: Ticket = {
                  id: uuid(),
                  holderId: caller.toString(),
                  eventId:eventId,
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
                UserStore.insert(caller, updatedUser);

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
     
    },
    None: () =>
      Result.Err<Ticket, string>(
        `can't purchase ticket: user with holderId=${caller.toString()} not found`
      ),
  });
}


//get event organizer
$query;
export function getTicketsOrganizer(
   eventId: string
): Result<Vec<Ticket>, string> {

  const caller = ic.caller();
  return match(UserStore.get(caller), {
    Some: (user) => {
  
        return match(EventStore.get(eventId), {
          Some: (event) => {
            if (event.organizerId === caller.toString()) {
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
      
    },
    None: () =>
      Result.Err<Vec<Ticket>, string>(
        `can't list tickets: user not found for organizerId=${caller.toString()}`
      ),
  });
}


//get tickets that belong to the user that has called this function
// it is equivalent to getting the tickets that belong to the user who supplies the id and their password
$query;
export function getTicketsAttendee(
): Result<Vec<Ticket>, string> {
  const caller = ic.caller()

  return match(UserStore.get(caller), {
    Some: (user) => {
 
        const tickets: Ticket[] = TicketStore.values();
        const returnedTickets: Vec<Ticket> = [];

        for (const ticket of tickets) {
          if (ticket.holderId === caller.toString()) {
            returnedTickets.push(ticket);
          }
        }
        return Result.Ok<Vec<Ticket>, string>(returnedTickets);
    },
    None: () =>
      Result.Err<Vec<Ticket>, string>(
        `can't list tickets: user not found for attendeeId=${caller.toString()}`
      ),
  });
}



//reclaim an old account by providing the password associated with it
$update;
export function migrateAccount( account : string, password : string): Result<string,string>{
  const caller = ic.caller();
  return match(UserStore.get(Principal.fromText(account)),{

    None : ()=>{ return Result.Err<string,string>("This account does not exist")},
    Some : (oldAccount)=>{
      if(oldAccount.password === password){
        UserStore.insert(caller, oldAccount);
        return Result.Ok<string,string>("Your account details have been restored, you can now login with the current Principal ID")
      }
      return Result.Err<string,string>("The passowrds dont match, try again later")
     }
  });
}

//getAccount details
$query;
export function getAccountDetails() : Result<User,string>{

  const caller = ic.caller()
  return match(UserStore.get(caller),{
    None:() =>{ return Result.Err<User,string>("no account")},
    Some:(user)=>{ return Result.Ok<User,string>(user)}
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
